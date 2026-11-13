"""Experimental per-user regression. No population training or clinical validation.

No fixed calories-per-kg conversion is used. Model changes are withheld until
there is enough history and performance exceeds a chronological baseline.
"""
from datetime import date, timedelta
from collections import defaultdict
import math
import numpy as np

SPORTS = ('strength', 'endurance', 'team', 'other')


def monday(day):
    return day - timedelta(days=day.weekday())


def recommend(profile: dict, entries: list[dict], before: date):
    # Imported here, not at module level: scikit-learn takes about a second to load
    # and only this endpoint needs it, so a cold start can serve sign-in and the journal first.
    from sklearn.linear_model import Ridge
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler
    result = dict(target=profile['baseline_calories'], status='collecting', samples=0,
                  reason='Keep your starting target while you build a consistent history.')
    weeks = defaultdict(list)
    for entry in entries:
        day = entry['date']
        day = date.fromisoformat(day) if isinstance(day, str) else day
        if day < before:
            weeks[monday(day)].append(entry)
    def summary(start):
        logs = weeks.get(start, [])
        weights = [r['weight'] for r in logs if r.get('weight') is not None]
        calories = [r['calories'] for r in logs if r.get('calories') is not None]
        steps = [r['steps'] for r in logs if r.get('steps') is not None]
        # Older entries have no activity report. Missing activity is unknown, not rest.
        activities = [r for r in logs if r.get('sport_type') is not None and r.get('activity_minutes') is not None]
        sport_minutes = [sum(r['activity_minutes'] for r in activities if r['sport_type'] == sport) for sport in SPORTS]
        return (weights, calories, sport_minutes if len(activities) >= 5 else None,
                float(np.mean(steps)) if len(steps) >= 5 else None)
    samples = []
    for start in sorted(weeks):
        if start + timedelta(days=7) > before:
            continue
        prev_weights, _, _, _ = summary(start - timedelta(days=7))
        weights, calories, activity, steps = summary(start)
        if len(prev_weights) >= 5 and len(weights) >= 5 and len(calories) >= 5:
            samples.append((float(np.mean(calories)), float(np.mean(weights) - np.mean(prev_weights)), activity, steps))
    samples = samples[-12:]
    result['samples'] = len(samples)
    if len(samples) < 6:
        return result
    x = np.array([s[0] for s in samples]).reshape(-1, 1)
    y = np.array([s[1] for s in samples])
    model = Ridge(alpha=40000).fit(x[:-2], y[:-2])
    mae = float(np.mean(np.abs(model.predict(x[-2:]) - y[-2:])))
    naive = float(np.mean(np.abs(np.mean(y[:-2]) - y[-2:])))
    final = Ridge(alpha=40000).fit(x, y)
    slope = float(final.coef_[0])
    base_ok = np.std(x[:-2]) >= 100 and 0.0002 <= slope <= 0.002 and mae < naive and mae <= 0.35

    # Choose the richest sufficiently logged history before looking at validation errors.
    # Sport is minutes per category; a label is never treated as an ordered number.
    candidates = (
        ('calories_sport_steps', lambda s: s[2] is not None and s[3] is not None,
         lambda s: [s[0], s[3], *s[2]], 1),
        ('calories_and_steps', lambda s: s[3] is not None,
         lambda s: [s[0], s[3]], 1),
        ('calories_and_sport', lambda s: s[2] is not None,
         lambda s: [s[0], *s[2]], 0),
    )
    for feature_name, eligible, features, steps_index in candidates:
        logged = [s for s in samples if eligible(s)]
        if len(logged) < 10 or not all(eligible(s) for s in samples[-2:]):
            continue
        ax = np.array([features(s) for s in logged], dtype=float)
        ay = np.array([s[1] for s in logged])
        sport_start = 2 if steps_index else 1
        variable_steps = steps_index and np.std(ax[:-2, 1]) >= 1000
        variable_sport = ax.shape[1] > sport_start and np.any(np.std(ax[:-2, sport_start:], axis=0) >= 30)
        if np.std(ax[:-2, 0]) < 100 or not (variable_steps or variable_sport):
            break
        # The scaler learns from training weeks only. Compare with calories alone
        # on exactly the same two later weeks, including explicit zero-step days.
        activity_model = make_pipeline(StandardScaler(), Ridge(alpha=2.0)).fit(ax[:-2], ay[:-2])
        activity_mae = float(np.mean(np.abs(activity_model.predict(ax[-2:]) - ay[-2:])))
        calorie_model = Ridge(alpha=40000).fit(ax[:-2, :1], ay[:-2])
        calorie_mae = float(np.mean(np.abs(calorie_model.predict(ax[-2:, :1]) - ay[-2:])))
        activity_naive = float(np.mean(np.abs(np.mean(ay[:-2]) - ay[-2:])))
        fitted = make_pipeline(StandardScaler(), Ridge(alpha=2.0)).fit(ax, ay)
        activity_slope = float(fitted[-1].coef_[0] / fitted[0].scale_[0])
        if (0.0002 <= activity_slope <= 0.002 and activity_mae <= 0.35
                and activity_mae + 0.02 < min(calorie_mae, activity_naive)):
            # Assume the latest logged step and sport routine continues next week.
            planned = np.array([[0, *ax[-1, 1:]]])
            goal = 0 if profile['goal'] == 'maintain' else profile['pace'] * (1 if profile['goal'] == 'gain' else -1)
            estimate = (goal - float(fitted.predict(planned)[0])) / activity_slope
            if math.isfinite(estimate) and 1500 <= estimate <= 4500:
                target = math.floor(max(profile['baseline_calories'] - 100,
                                        min(profile['baseline_calories'] + 100, estimate)) / 25 + 0.5) * 25
                return dict(result, target=target, status='experimental', validation_mae=activity_mae,
                            model_features=feature_name,
                            reason='An experimental estimate using logged calories and activity, assuming your latest weekly routine continues. Limited to a 100 kcal change.')
        break

    if not base_ok:
        return dict(result, status='uncertain', reason='The pattern is not reliable yet. Your starting target stays in place.')
    goal = 0 if profile['goal'] == 'maintain' else profile['pace'] * (1 if profile['goal'] == 'gain' else -1)
    estimate = (goal - float(final.intercept_)) / slope
    if not math.isfinite(estimate) or not 1500 <= estimate <= 4500:
        return dict(result, status='uncertain', reason='The estimate is outside the supported planning range. Keep your starting target.')
    target = math.floor(max(profile['baseline_calories'] - 100,
                            min(profile['baseline_calories'] + 100, estimate)) / 25 + 0.5) * 25
    return dict(result, target=target, status='experimental', validation_mae=mae, model_features='calories',
                reason='An experimental estimate from your history, limited to a 100 kcal change from your starting target.')
