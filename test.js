// Using built-in fetch

async function testQuery(query) {
  console.log(`\n=== Testing: ${query} ===`);
  const intentPayload = { query, trajectory: {} };
  const chatPayload = { messages: [{ role: "user", content: query }], system: "test", model: "gemini-2.5-flash" };

  try {
    console.log('1. Testing /api/intentInfer...');
    const intentRes = await fetch('https://thisone-rho.vercel.app/api/intentInfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(intentPayload)
    });
    
    if (intentRes.ok) {
      const data = await intentRes.json();
      console.log('intentInfer SUCCESS: 200 OK');
    } else {
      console.error(`intentInfer FAILED: ${intentRes.status} ${await intentRes.text()}`);
      return false;
    }

    console.log('2. Testing /api/chat...');
    const chatRes = await fetch('https://thisone-rho.vercel.app/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chatPayload)
    });

    if (chatRes.ok) {
      console.log('chat SUCCESS: 200 OK');
      // Read a bit of the stream
      const text = await chatRes.text();
      if (text.length > 0) {
        console.log(`chat STREAM DATA RECEIVED (${text.length} bytes)`);
      } else {
        console.warn('chat STREAM EMPTY');
        return false;
      }
    } else {
      console.error(`chat FAILED: ${chatRes.status} ${await chatRes.text()}`);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Network Error:', err.message);
    return false;
  }
}

async function runAll() {
  const queries = [
    "비스포크 AI 콤보",
    "로보락 S8 MaxV Ultra",
    "다이슨 에어랩"
  ];
  
  let allSuccess = true;
  for (const q of queries) {
    const success = await testQuery(q);
    if (!success) {
      allSuccess = false;
      break;
    }
  }
  
  if (allSuccess) {
    console.log("\nALL TESTS PASSED SUCCESSFULLY");
  } else {
    console.log("\nSOME TESTS FAILED");
  }
}

runAll();
