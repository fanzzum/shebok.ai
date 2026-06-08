"""Send WhatsApp Cloud API text message (used by n8n HTTP Request node or local tests)."""

from __future__ import annotations

import json
import os
import urllib.request


def send_text(to_phone: str, body: str) -> dict:
    """to_phone: E.164 without + prefix issues — e.g. 8801XXXXXXXXX"""
    token = os.environ["WHATSAPP_ACCESS_TOKEN"]
    phone_id = os.environ["WHATSAPP_PHONE_NUMBER_ID"]
    version = os.environ.get("WHATSAPP_API_VERSION", "v21.0")
    url = f"https://graph.facebook.com/{version}/{phone_id}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "to": to_phone.lstrip("+"),
        "type": "text",
        "text": {"body": body},
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 3:
        print("Usage: python whatsapp_send.py <to_e164> <message>")
        raise SystemExit(1)
    print(send_text(sys.argv[1], " ".join(sys.argv[2:])))
