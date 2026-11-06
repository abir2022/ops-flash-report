"""Alerting for ETL failures / stalls (email | teams | telegram)."""

from __future__ import annotations

import smtplib
import urllib.request
from email.message import EmailMessage

import structlog

from .config import Settings

log = structlog.get_logger()


def send_alert(settings: Settings, subject: str, body: str) -> None:
    channel = settings.alert_channel.lower()
    if channel == "none":
        return
    try:
        if channel == "email":
            _send_email(settings, subject, body)
        elif channel == "teams":
            _send_teams(settings, subject, body)
        else:
            log.warning("unsupported alert channel", channel=channel)
    except Exception as exc:  # alerting must never break the pipeline
        log.error("alert send failed", channel=channel, error=str(exc))


def _send_email(settings: Settings, subject: str, body: str) -> None:
    if not settings.smtp_host or not settings.alert_recipients:
        return
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.smtp_user or "etl@opsflash.local"
    msg["To"] = settings.alert_recipients
    msg.set_content(body)
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as s:
        s.starttls()
        if settings.smtp_user:
            s.login(settings.smtp_user, settings.smtp_password)
        s.send_message(msg)


def _send_teams(settings: Settings, subject: str, body: str) -> None:
    if not settings.teams_webhook_url:
        return
    payload = {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        "summary": subject,
        "text": body,
    }
    req = urllib.request.Request(
        settings.teams_webhook_url,
        data=str(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    urllib.request.urlopen(req, timeout=10)  # noqa: S310
