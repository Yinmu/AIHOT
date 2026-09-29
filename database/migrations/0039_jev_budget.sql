-- Experimental native Jev selection requests share a bounded service budget.
INSERT INTO budgets (service, per_minute, per_hour, per_day, note)
VALUES ('typesafe', 60, 300, 1000, 'Jev 离线精选评测；请求次数上限，非金额上限')
ON CONFLICT (service) DO NOTHING;
