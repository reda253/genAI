# smoke_test.py: checks your Data and Power layers (Setup Guide, Check 3)
# Install once:
#   pip install openai python-dotenv requests
#
# Adapted from the guide: reads our METERLESS_* names (falls back to the
# guide's MODEL_* names), sends the Meterless headers, and allows enough
# tokens for Nemotron's reasoning.
import os
import uuid
import requests
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()
results = []


def env(*names):
    for name in names:
        if os.environ.get(name):
            return os.environ[name]
    raise AssertionError(f"{names[0]} is missing from .env")


def check(name, fn):
    try:
        fn()
        results.append(("PASS", name, ""))
    except Exception as error:
        results.append(("FAIL", name, str(error)[:150]))


def zetaris_web():
    url = os.environ.get("ZETARIS_BASE_URL", "http://localhost:3000")
    requests.get(url, timeout=10).raise_for_status()


def zetaris_sql():
    response = requests.post(
        env("ZETARIS_REST_URL").rstrip("/") + "/sql-editor/sqls/run",
        headers={
            "Authorization": "Bearer " + env("ZETARIS_API_KEY"),
            "X-Org-ID": env("ZETARIS_ORG_ID"),
            "X-Request-ID": str(uuid.uuid4()),
        },
        json={"queryId": str(uuid.uuid4()), "sql": "SELECT 1",
              "source": "SqlEditor", "limit": 1},
        timeout=60,
    )
    response.raise_for_status()
    data = response.json().get("data")
    assert data and str(data[0][0]) == "1", \
        "unexpected reply: " + response.text[:80]


def nemotron():
    model = env("METERLESS_MODEL", "NEMOTRON_MODEL")
    client = OpenAI(
        base_url=env("METERLESS_BASE_URL", "MODEL_BASE_URL"),
        api_key=env("METERLESS_RUNTIME_TOKEN", "MODEL_API_KEY"),
        default_headers={"meterless-app": "ledger-lens",
                         "meterless-scope": "user"},
    )
    reply = client.chat.completions.create(
        model=model,
        max_tokens=2000,
        messages=[{"role": "user", "content":
                   "Reply with the single word: ready"}],
    )
    assert reply.choices and reply.choices[0].message.content, \
        "no reply from the model"
    print(f"  model={model} -> {reply.choices[0].message.content.strip()[-60:]!r}")


check("Data: Zetaris web interface", zetaris_web)
check("Data: Zetaris runs SQL over its REST API", zetaris_sql)
check("Power: Nemotron replies", nemotron)

for status, name, detail in results:
    print(f"{status} {name} {detail}")
