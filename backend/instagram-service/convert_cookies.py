import json
import os
from instagrapi import Client

# Caminhos
PUPPETEER_COOKIES_PATH = '../cookies/GGpUHF7XgkuBOW89C2w8.json'
SESSION_FILE_PATH = 'sessions/GGpUHF7XgkuBOW89C2w8.json'

def convert_cookies():
    if not os.path.exists(PUPPETEER_COOKIES_PATH):
        print(f"❌ Arquivo de cookies não encontrado: {PUPPETEER_COOKIES_PATH}")
        return

    print(f"📖 Lendo cookies do Puppeteer...")
    with open(PUPPETEER_COOKIES_PATH, 'r') as f:
        puppeteer_cookies = json.load(f)

    # Converter lista de cookies para dicionário
    cookies_dict = {}
    for cookie in puppeteer_cookies:
        cookies_dict[cookie['name']] = cookie['value']

    print(f"🍪 {len(cookies_dict)} cookies convertidos.")

    # Criar cliente e definir cookies
    cl = Client()
    cl.set_settings({'cookies': cookies_dict})

    # Tentar verificar login
    try:
        print("🔐 Verificando sessão...")
        cl.get_timeline_feed()
        print("✅ Sessão válida!")
        
        # Salvar sessão no formato Instagrapi
        cl.dump_settings(SESSION_FILE_PATH)
        print(f"💾 Sessão salva em: {SESSION_FILE_PATH}")
        
    except Exception as e:
        print(f"❌ Erro ao validar sessão: {str(e)}")

if __name__ == '__main__':
    convert_cookies()
