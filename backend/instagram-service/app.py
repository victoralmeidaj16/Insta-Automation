from flask import Flask, request, jsonify
from instagrapi import Client
from instagrapi.exceptions import LoginRequired, ChallengeRequired
import os
import tempfile
import requests

app = Flask(__name__)

# Diretório para sessions
SESSIONS_DIR = 'sessions'
if not os.path.exists(SESSIONS_DIR):
    os.makedirs(SESSIONS_DIR)

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'service': 'instagram-api'})

@app.route('/story', methods=['POST'])
def post_story():
    """
    Endpoint para publicar Story no Instagram
    
    Body esperado:
    {
        "account_id": "GGpUHF7XgkuBOW89C2w8",
        "username": "viverpsicologiastreaming",
        "password": "Viverstreming2024",
        "image_url": "https://storage.googleapis.com/...",
        "caption": "Texto opcional"
    }
    """
    try:
        data = request.json
        account_id = data['account_id']
        username = data['username']
        password = data['password']
        image_url = data['image_url']
        caption = data.get('caption', '')
        
        print(f'📱 Iniciando publicação de Story para @{username}...')
        
        # Criar cliente Instagrapi
        cl = Client()
        
        # Tentar carregar sessão salva
        session_file = os.path.join(SESSIONS_DIR, f'{account_id}.json')
        if os.path.exists(session_file):
            print(f'✅ Carregando sessão salva...')
            cl.load_settings(session_file)
            try:
                cl.login(username, password)
                cl.get_timeline_feed()  # Verificar se login está válido
                print('✅ Login com sessão salva OK')
            except LoginRequired:
                print('⚠️ Sessão expirada, fazendo login novamente...')
                cl = Client()
                cl.login(username, password)
                cl.dump_settings(session_file)
        else:
            print('🔐 Primeira vez, fazendo login...')
            cl.login(username, password)
            cl.dump_settings(session_file)
            print('✅ Login realizado e sessão salva')
        
        # Baixar imagem do Firebase Storage
        print(f'📥 Baixando imagem do Firebase Storage...')
        response = requests.get(image_url)
        response.raise_for_status()
        
        # Salvar temporariamente
        with tempfile.NamedTemporaryFile(delete=False, suffix='.jpg') as temp_file:
            temp_file.write(response.content)
            temp_image_path = temp_file.name
        
        print(f'📤 Publicando Story...')
        # Publicar Story
        media = cl.photo_upload_to_story(
            temp_image_path,
            caption=caption
        )
        
        # Limpar arquivo temporário
        os.unlink(temp_image_path)
        
        print(f'✅ Story publicado com sucesso! Media ID: {media.pk}')
        
        return jsonify({
            'success': True,
            'media_id': media.pk,
            'url': f'https://instagram.com/stories/{username}/{media.pk}'
        })
        
    except ChallengeRequired as e:
        print(f'❌ Desafio de segurança detectado (2FA ou CAPTCHA)')
        return jsonify({
            'success': False,
            'error': 'Challenge required - 2FA ou CAPTCHA necessário',
            'details': str(e)
        }), 400
        
    except Exception as e:
        print(f'❌ Erro ao publicar Story: {str(e)}')
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    print('🚀 Instagram Service iniciando...')
    print('📍 Endpoints disponíveis:')
    print('   - GET  /health')
    print('   - POST /story')
    app.run(host='0.0.0.0', port=5001, debug=True)
