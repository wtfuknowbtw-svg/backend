-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "ownerName" TEXT,
ADD COLUMN     "pushToken" TEXT;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "interval" TEXT NOT NULL DEFAULT 'month',
ADD COLUMN     "razorpayCustomerId" TEXT,
ADD COLUMN     "razorpaySubscriptionId" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "customerName" TEXT,
ADD COLUMN     "customerPhone" TEXT;
