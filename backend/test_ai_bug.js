fetch('http://localhost:5001/api/ai/generate-single-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        prompt: "adapte essa imagem para ter 1080 x 1350",
        aspectRatio: "4:5",
        attachLogo: true,
        referenceImage: "https://example.com/dummy.jpg"
    })
}).then(res => res.text()).then(console.log).catch(console.error);
