"""Experimental per-user regression. No population training or clinical validation.

No fixed calories-per-kg conversion is used. Model changes are withheld until
there is enough history and performance exceeds a chronological baseline.
"""
from datetime import date, timedelta
from collections import defaultdict
import math
import numpy as np
from sklearn.linear_model import Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

SPORTS = ('strength', 'endurance', 'team', 'other')


def monday(day):
    return day - timedelta(days=day.weekday())


def recommend(profile: dict, entries: list[dict], before: date):
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
        # Older entries have no activity report. Missing activity is unknown, not rest.
        activities = [r for r in logs if r.get('sport_type') is not None and r.get('activity_minutes') is not None]
        sport_minutes = [sum(r['activity_minutes'] for r in activities if r['sport_type'] == sport) for sport in SPORTS]
        return weights, calories, sport_minutes if len(activities) >= 5 else None
    samples = []
    for start in sorted(weeks):
        if start + timedelta(days=7) > before:
            continue
        prev_weights, _, _ = summary(start - timedelta(days=7))
        weights, calories, activity = summary(start)
        if len(prev_weights) >= 5 and len(weights) >= 5 and len(calories) >= 5:
            samples.append((float(np.mean(calories)), float(np.mean(weights) - np.mean(prev_weights)), activity))
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

    # Sport is represented by minutes in each category, never an arbitrary integer label.
    # Fit the scaler only on training weeks; use this model only when it beats
    # calories alone on the same two held-out weeks.
    activity_samples = [s for s in samples if s[2] is not None]
    if len(activity_samples) >= 10 and all(s[2] is not None for s in samples[-2:]):
        ax = np.array([[s[0], *s[2]] for s in activity_samples], dtype=float)
        ay = np.array([s[1] for s in activity_samples])
        if np.std(ax[:-2, 0]) >= 100 and np.any(np.std(ax[:-2, 1:], axis=0) >= 30):
            activity_model = make_pipeline(StandardScaler(), Ridge(alpha=2.0)).fit(ax[:-2], ay[:-2])
            activity_mae = float(np.mean(np.abs(activity_model.predict(ax[-2:]) - ay[-2:])))
            calorie_model = Ridge(alpha=40000).fit(ax[:-2, :1], ay[:-2])
            calorie_mae = float(np.mean(np.abs(calorie_model.predict(ax[-2:, :1]) - ay[-2:])))
            activity_naive = float(np.mean(np.abs(np.mean(ay[:-2]) - ay[-2:])))
            fitted = make_pipeline(StandardScaler(), Ridge(alpha=2.0)).fit(ax, ay)
            activity_slope = float(fitted[-1].coef_[0] / fitted[0].scale_[0])
            if (0.0002 <= activity_slope <= 0.002 and activity_mae <= 0.35
                    and activity_mae + 0.02 < min(calorie_mae, activity_naive)):
                # Assume the latest logged sport routine continues next week.
                planned = np.array([[0, *ax[-1, 1:]]])
                estimate = (0 if profile['goal'] == 'maintain' else profile['pace'] * (1 if profile['goal'] == 'gain' else -1))
                estimate = (estimate - float(fitted.predict(planned)[0])) / activity_slope
                if math.isfinite(estimate) and 1500 <= estimate <= 4500:
                    target = math.floor(max(profile['baseline_calories'] - 100,
                                            min(profile['baseline_calories'] + 100, estimate)) / 25 + 0.5) * 25
                    return dict(result, target=target, status='experimental', validation_mae=activity_mae,
                                model_features='calories_and_sport',
                                reason='An experimental estimate using your calories and logged sport, assuming your latest weekly activity continues. Limited to a 100 kcal change.')

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
