from datetime import date, timedelta
from app.recommendation import recommend
from test_api import PROFILE

def make_history(intakes):
    start=date(2026,1,5)
    weight=68.0
    entries=[]
    for i,intake in enumerate(intakes):
        if i: weight+=(intake-2300)*0.0009
        for day in range(7):
            entries.append({'date':(start+timedelta(days=i*7+day)).isoformat(),'weight':weight,'calories':intake})
    return entries,start+timedelta(days=len(intakes)*7)

def test_empty_and_incomplete_history_holds_baseline():
    assert recommend(PROFILE,[],date(2026,10,1))['target']==2500
    entries,before=make_history([2000,2700,2100])
    result=recommend(PROFILE,entries,before)
    assert result['status']=='collecting'
    assert result['samples']==2

def test_constant_calories_are_not_treated_as_reliable_ml():
    entries,before=make_history([2500]*9)
    result=recommend(PROFILE,entries,before)
    assert result['status']=='uncertain'
    assert result['target']==2500

def test_predictive_history_yields_bounded_experimental_target():
    entries,before=make_history([2300,1900,2800,2100,2700,2000,2600,2400,2500])
    result=recommend(PROFILE,entries,before)
    assert result['status']=='experimental'
    assert 2400<=result['target']<=2600
    assert result['validation_mae']<0.35

def test_future_data_cannot_change_historical_target():
    entries,before=make_history([2300,1900,2800,2100,2700,2000,2600,2400,2500])
    result=recommend(PROFILE,entries,before)
    future=[{'date':before+timedelta(days=i),'weight':150,'calories':1000} for i in range(40)]
    assert recommend(PROFILE,entries+future,before)==result

def test_week_gaps_do_not_create_fake_training_pairs():
    entries,before=make_history([2300,1900,2800,2100,2700,2000,2600,2400,2500])
    entries=[e for e in entries if not '2026-01-19'<=e['date']<='2026-01-25']
    result=recommend(PROFILE,entries,before)
    assert result['samples']==6

def test_sparse_sport_logs_keep_existing_calorie_model():
    entries,before=make_history([2300,1900,2800,2100,2700,2000,2600,2400,2500])
    baseline=recommend(PROFILE,entries,before)
    for entry in entries[-7:]:
        entry.update(sport_type='strength',activity_minutes=40)
    result=recommend(PROFILE,entries,before)
    assert result==baseline

def test_sport_type_is_encoded_by_duration_when_history_supports_it():
    intakes=[2300,1900,2800,2100,2700,2000,2600,2400,2500,1950,2750,2050,2650,2150]
    kinds=['none','strength','endurance','none','strength','endurance','strength',
           'none','endurance','strength','none','endurance','strength','none']
    entries,before=make_history(intakes)
    # One session per week. The following week's weight reflects that week's sport.
    weight=68.0
    for i,(intake,kind) in enumerate(zip(intakes,kinds)):
        if i:
            weight+=(intake-2300)*0.0009+({'strength':0.25,'endurance':-0.25,'none':0}[kind])
        for entry in entries[i*7:(i+1)*7]:
            entry['weight']=weight
            entry['sport_type']='none'
            entry['activity_minutes']=0
        if kind!='none':
            entries[i*7]['sport_type']=kind
            entries[i*7]['activity_minutes']=120
    result=recommend(PROFILE,entries,before)
    assert result['model_features']=='calories_and_sport'
    assert result['status']=='experimental'
    assert result['validation_mae']<0.35
    future=[{'date':before+timedelta(days=i),'weight':150,'calories':1000,
             'sport_type':'endurance','activity_minutes':600} for i in range(14)]
    assert recommend(PROFILE,entries+future,before)==result
    # A constant step count adds no spurious step effect to the sport model.
    with_steps=[dict(entry,steps=7000) for entry in entries]
    assert recommend(PROFILE,with_steps,before)['model_features']=='calories_sport_steps'
    for entry in entries[-7:]:
        entry.pop('sport_type')
        entry.pop('activity_minutes')
    assert recommend(PROFILE,entries,before).get('model_features')!='calories_and_sport'

def test_steps_can_improve_validated_prediction_without_sport_logs():
    intakes=[2300,2600,2600,1900,2400,2800,2700,2600,2400,2700,2500,2200,2800,2100]
    step_counts=[7000,11000,3000,3000,11000,3000,11000,
                 3000,3000,11000,11000,3000,11000,11000]
    entries,before=make_history(intakes)
    weight=68.0
    for i,(intake,count) in enumerate(zip(intakes,step_counts)):
        if i:
            weight+=(intake-2300)*0.0009-(count-7000)*0.00005
        for entry in entries[i*7:(i+1)*7]:
            entry['weight']=weight
            entry['steps']=count
    result=recommend(PROFILE,entries,before)
    assert result['status']=='experimental'
    assert result['model_features']=='calories_and_steps'
    assert result['validation_mae']<0.35
    future=[{'date':before+timedelta(days=i),'weight':150,'calories':1000,'steps':100000} for i in range(14)]
    assert recommend(PROFILE,entries+future,before)==result
    for entry in entries[-7:]:
        entry.pop('steps')
    assert recommend(PROFILE,entries,before).get('model_features')!='calories_and_steps'

def test_target_moves_from_recent_intake_not_starting_target():
    # Same history with a starting target far below what the person eats.
    # The limit follows recent intake (2450 kcal), so the target is not stuck at 2000 + 100.
    entries,before=make_history([2300,1900,2800,2100,2700,2000,2600,2400,2500])
    result=recommend({**PROFILE,'baseline_calories':2000},entries,before)
    assert result['status']=='experimental'
    assert 2350<=result['target']<=2550
