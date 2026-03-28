
import axios from 'axios';

async function testEditorialRefinement() {
    try {
        console.log('🧪 Testing Refined Editorial Prompt (Length Check)...');

        const longProductService = "Viver Mais Psicologia Streaming é uma plataforma de cursos online nas diversas áreas da Psicologia, com novos cursos todos os meses. além de contar com Estudos de Casos, Role-play - práticas simuladas, Ciclos de Eventos (aulas ao vivo em determinada epoca do ano para atrair mais leads) Aulas ao vivo, Grupo de Estudos ,grupo de teatro online para o psicologo desenvolver a espontaneidade (dar menos enfase ao grupo de teatro), e acesso a supervisão clínica todos os meses (para alunos de psicologia e psicologos possam tirar suas dúvidas de seus atendimentos clinicos com psicólogos experientes) sendo a unica plataforma de cursos de psicologia que oferece a supervisão clínica (pode ser um dos diferenciais a citar no marketing, pois acreditamos que seja um ótimo ponto). cursos com resumos, cursos com avaliações sobre o conteudo com feedback personalizado (respostas explicando o porque da opção selecionada estar certa ou errada) e grupos de estudo. O objetivo é enfatizar que a Viver Mais Psicologia Streaming oferece formação clínica completa (com mais aprendizados e de uma forma interativa e leve) e prática, enquanto os concorrentes focam apenas em vídeos. certificado após conclusão dos cursos e eventos (reconhecido pelo MEC).";

        const payload = {
            prompt: 'Como a ansiedade afeta a produtividade no trabalho remoto',
            aspectRatio: '4:5',
            brandingStyle: 'Cinematic, blue tones, professional',
            isEditorial: true, // This triggers the new template logic
            context: {
                primaryColor: '#3498db',
                targetAudience: 'Remote Workers' + ' '.repeat(100), // Also test long audience string if needed
                productService: longProductService,
                brandName: 'MindfulWork'
            }
        };

        const response = await axios.post('http://localhost:3001/api/ai/generate-single-image', payload);

        console.log('✅ Response:', response.data);
    } catch (error) {
        console.error('❌ Error:', error.response ? error.response.data : error.message);
    }
}

testEditorialRefinement();
