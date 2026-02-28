async function test() {
    try {
        const res2 = await fetch('http://192.168.40.156:4000/api/wallet/some-random-id');
        const data = await res2.json();
        console.log(JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('Fetch failed:', err.message);
    }
}
test();
