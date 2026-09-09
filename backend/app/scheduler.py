from apscheduler.schedulers.background import BackgroundScheduler

from app.deadlines import check_and_send_deadline_alerts, check_and_send_overdue_alerts
from app.sprint_forwarding import auto_forward_expired_sprints
from app.config import DEADLINE_CHECK_INTERVAL_MINUTES

_scheduler = None


def start_scheduler():
    global _scheduler
    if _scheduler is not None:
        return _scheduler

    _scheduler = BackgroundScheduler()

    def deadline_job():
        try:
            result = check_and_send_deadline_alerts()
            if result["emailed"]:
                print(f"[DEADLINES] Alert sent — {result['processes']} process(es).")
        except Exception as err:
            print(f"[DEADLINES] Check failed: {err}")

    def overdue_job():
        try:
            result = check_and_send_overdue_alerts()
            if result["emailed"]:
                print(f"[OVERDUE] Alert sent — {result['processes']} process(es) past due.")
        except Exception as err:
            print(f"[OVERDUE] Check failed: {err}")

    def sprint_job():
        try:
            result = auto_forward_expired_sprints()
            if result["sprints_closed"]:
                print(f"[SPRINTS] Auto-closed {result['sprints_closed']} sprint(s), "
                      f"forwarded {result['processes_moved']} unfinished process(es).")
        except Exception as err:
            print(f"[SPRINTS] Auto-forward check failed: {err}")

    _scheduler.add_job(deadline_job, "interval", minutes=DEADLINE_CHECK_INTERVAL_MINUTES,
                        id="deadline_check", next_run_time=None)
    _scheduler.add_job(overdue_job, "interval", minutes=DEADLINE_CHECK_INTERVAL_MINUTES,
                        id="overdue_check", next_run_time=None)
    # Sprints only need a once-a-day check — nothing changes faster than
    # that (a sprint's end date doesn't move within the day).
    _scheduler.add_job(sprint_job, "interval", hours=24, id="sprint_auto_forward", next_run_time=None)

    _scheduler.start()
    print(f"[DEADLINES] Background check scheduled every {DEADLINE_CHECK_INTERVAL_MINUTES} minute(s).")
    print("[SPRINTS] Auto-forward check scheduled every 24 hours.")
    return _scheduler


def stop_scheduler():
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
