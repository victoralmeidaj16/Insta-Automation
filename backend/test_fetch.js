async function go() {
    const req = await fetch('http://localhost:5001/api/ai/generate-single-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            prompt: "adapte essa imagem test",
            aspectRatio: "4:5",
            attachLogo: true,
            referenceImage: "https://firebasestorage.googleapis.com/v0/b/inner-boost-app.appspot.com/o/uploads%2FZ88hFqA1Vw1Nig%2F17502...png?alt=media"
        })
    });
    console.log(req.status, await req.text());
}
go().catch(console.error);
