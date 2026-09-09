import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from app.config import SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM


def send_email(to_address: str, subject: str, body_text: str) -> bool:
    """
    Sends an email via SMTP. If SMTP_HOST is not configured, prints the
    email to the console instead (so deadline alerts are still visible
    while you're testing, without needing real mail credentials) and
    returns True as if it "sent" — the caller doesn't need to branch on
    whether real SMTP is set up.
    """
    if not SMTP_HOST:
        print("\n" + "=" * 60)
        print("[EMAIL - SMTP not configured, printing instead of sending]")
        print(f"To:      {to_address}")
        print(f"Subject: {subject}")
        print("-" * 60)
        print(body_text)
        print("=" * 60 + "\n")
        return True

    try:
        msg = MIMEMultipart()
        msg["From"] = SMTP_FROM
        msg["To"] = to_address
        msg["Subject"] = subject
        msg.attach(MIMEText(body_text, "plain"))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
            server.starttls()
            if SMTP_USER:
                server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_FROM, [to_address], msg.as_string())
        return True
    except Exception as err:
        print(f"[EMAIL] Failed to send to {to_address}: {err}")
        return False
