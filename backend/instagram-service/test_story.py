import requests
import json

# Configurações
API_URL = 'http://localhost:5001/story'
IMAGE_URL = 'https://firebasestorage.googleapis.com/v0/b/studyy-8312b.firebasestorage.app/o/posts%2F1733433318285_Falas%20cita%C3%A7oes%20da%20aula%20(Post%20para%20Instagram..png?alt=media&token=e9377484-9169-424a-939e-43642398555e'

payload = {
    "account_id": "GGpUHF7XgkuBOW89C2w8",
    "username": "viverpsicologiastreaming",
    "password": "Viverstreming2024",
    "image_url": IMAGE_URL,
    "caption": "Teste automático via Instagrapi 🚀"
}

print(f"🚀 Enviando requisição para {API_URL}...")
print(f"📦 Payload: {json.dumps(payload, indent=2)}")

try:
    response = requests.post(API_URL, json=payload)
    print(f"📡 Status Code: {response.status_code}")
    
    if response.status_code == 200:
        print("✅ Sucesso!")
        print(json.dumps(response.json(), indent=2))
    else:
        print("❌ Erro:")
        print(response.text)
        
except Exception as e:
    print(f"❌ Erro de conexão: {str(e)}")
