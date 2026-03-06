const { verifyToken, generateToken } = require('./lib/jwt.ts');

// Test token generation and verification
const testPhone = "+918888888888";
const testBusinessId = "test-business-id";

console.log("Testing JWT token generation and verification...");

// Generate a token
const token = generateToken(testBusinessId, testPhone);
console.log("Generated token:", token);

// Verify the token
const decoded = verifyToken(token);
console.log("Decoded payload:", decoded);

// Test with the actual token from the API
const apiToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJidXNpbmVzc0lkIjoiY21tZXM0cXNmMDAwNjExeWV2b2dpZGc2eiIsInBob25lIjoiKzkxODg4ODg4ODg4OCIsImlhdCI6MTc3Mjc5NDYyMywiZXhwIjoxNzM0Mzk5NDIzfQ.NQps4sRQROk6FeUTX5DkMMukyi_RyJTOX0baaMnOI38";
const apiDecoded = verifyToken(apiToken);
console.log("API token decoded:", apiDecoded);
