import os
import requests

API_URL = os.getenv("INSTAGRAM_SERVICE_URL", "http://localhost:5001/story")
required = {
    "account_id": os.getenv("TARGET_ACCOUNT_ID"),
    "username": os.getenv("INSTAGRAM_USERNAME"),
    "password": os.getenv("INSTAGRAM_PASSWORD"),
    "image_url": os.getenv("STORY_IMAGE_URL"),
}

missing = [key for key, value in required.items() if not value]
if missing:
    raise SystemExit(
        "Variáveis obrigatórias ausentes: " + ", ".join(missing)
        + ". Nunca grave credenciais ou URLs assinadas neste arquivo."
    )

payload = {
    **required,
    "caption": os.getenv("STORY_CAPTION", ""),
}

print(f"Enviando Story para {API_URL} com a conta {required['account_id']}...")

try:
    response = requests.post(API_URL, json=payload, timeout=60)
    print(f"Status Code: {response.status_code}")
    response.raise_for_status()
    print("Story enviado com sucesso.")
except requests.RequestException as error:
    raise SystemExit(f"Falha ao enviar Story: {error}") from error
