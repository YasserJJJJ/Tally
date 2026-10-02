"""Experimental per-user regression. No population training or clinical validation.

No fixed calories-per-kg conversion is used. Model changes are withheld until
there is enough history and performance exceeds a chronological baseline.
"""
from datetime import date, timedelta
from collections import defaultdict
import math
import numpy as np
from sklearn.linear_model import Ridge


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
        return weights, calories
    samples = []
    for start in sorted(weeks):
        if start + timedelta(days=7) > before:
            continue
        prev_weights, _ = summary(start - timedelta(days=7))
        weights, calories = summary(start)
        if len(prev_weights) >= 5 and len(weights) >= 5 and len(calories) >= 5:
            samples.append((float(np.mean(calories)), float(np.mean(weights) - np.mean(prev_weights))))
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
    if np.std(x[:-2]) < 100 or not 0.0002 <= slope <= 0.002 or mae >= naive or mae > 0.35:
        return dict(result, status='uncertain', reason='The pattern is not reliable yet. Your starting target stays in place.')
    goal = 0 if profile['goal'] == 'maintain' else profile['pace'] * (1 if profile['goal'] == 'gain' else -1)
    estimate = (goal - float(final.intercept_)) / slope
    if not math.isfinite(estimate) or not 1500 <= estimate <= 4500:
        return dict(result, status='uncertain', reason='The estimate is outside the supported planning range. Keep your starting target.')
    target = math.floor(max(profile['baseline_calories'] - 100,
                            min(profile['baseline_calories'] + 100, estimate)) / 25 + 0.5) * 25
    return dict(result, target=target, status='experimental', validation_mae=mae,
                reason='An experimental estimate from your history, limited to a 100 kcal change from your starting target.')
