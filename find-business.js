const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const business = await prisma.business.findFirst();
    if (business) {
        console.log('BUSINESS_ID:' + business.id);
    } else {
        console.log('No business found');
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
