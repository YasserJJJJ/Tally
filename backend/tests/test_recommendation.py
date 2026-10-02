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
