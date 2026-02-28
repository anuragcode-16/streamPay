async function test() {
    try {
        const res = await fetch('http://localhost:4000/api/wallet/user_demo_customer');
        console.log('Status:', res.status);
        const text = await res.text();
        console.log('Body:', text);
    } catch (err) {
        console.error('Fetch failed:', err.message);
    }
}
test();
