import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { verifyJWT, unauthorizedResponse } from "@/middleware/auth";
import { prisma } from "@/lib/prisma";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { user, error } = await verifyJWT(request);
  if (!user) {
    return unauthorizedResponse(error || "Unauthorized");
  }

  const businessId = user.businessId;
  const invoiceId = params.id;

  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        items: true,
        business: true,
      },
    });

    if (!invoice) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    if (invoice.businessId !== businessId) {
      return NextResponse.json(
        { error: "Unauthorized access to invoice PDF" },
        { status: 403 }
      );
    }

    // Create PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.27, 841.89]); // A4 Size
    const { width, height } = page.getSize();

    // Fonts
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Color definitions
    const saffron = rgb(255 / 255, 107 / 255, 0 / 255); // #FF6B00
    const darkBlue = rgb(26 / 255, 60 / 255, 110 / 255); // #1A3C6E
    const textDark = rgb(33 / 255, 33 / 255, 33 / 255);
    const textMuted = rgb(120 / 255, 120 / 255, 120 / 255);
    const lightGray = rgb(245 / 255, 245 / 255, 245 / 255);
    const borderGray = rgb(220 / 255, 220 / 255, 220 / 255);

    let y = height - 50;

    // --- TOP SECTION ---
    // Brand Logo/Wordmark (Left)
    page.drawText("ApnaKhata", {
      x: 50,
      y: y - 10,
      size: 26,
      font: fontBold,
      color: saffron,
    });

    // Business Info (Right)
    const busName = invoice.business.name || invoice.business.ownerName || "My Kirana Shop";
    const busPhone = invoice.business.phone;
    const busGstin = invoice.business.gstin;

    const busNameWidth = fontBold.widthOfTextAtSize(busName, 12);
    page.drawText(busName, {
      x: width - 50 - busNameWidth,
      y: y,
      size: 12,
      font: fontBold,
      color: darkBlue,
    });

    y -= 15;
    const phoneText = `Phone: ${busPhone}`;
    const phoneWidth = fontRegular.widthOfTextAtSize(phoneText, 9);
    page.drawText(phoneText, {
      x: width - 50 - phoneWidth,
      y: y,
      size: 9,
      font: fontRegular,
      color: textDark,
    });

    if (busGstin) {
      y -= 12;
      const gstinText = `GSTIN: ${busGstin}`;
      const gstinWidth = fontRegular.widthOfTextAtSize(gstinText, 9);
      page.drawText(gstinText, {
        x: width - 50 - gstinWidth,
        y: y,
        size: 9,
        font: fontRegular,
        color: textDark,
      });
    }

    y -= 40;

    // Draw horizontal line separator
    page.drawLine({
      start: { x: 50, y },
      end: { x: width - 50, y },
      thickness: 1,
      color: borderGray,
    });

    y -= 25;

    // --- INVOICE & CUSTOMER INFO SECTION ---
    // Left: Customer details
    page.drawText("Bill To:", {
      x: 50,
      y,
      size: 10,
      font: fontBold,
      color: textMuted,
    });
    
    y -= 15;
    page.drawText(invoice.customerName, {
      x: 50,
      y,
      size: 12,
      font: fontBold,
      color: textDark,
    });

    if (invoice.customerPhone) {
      y -= 15;
      page.drawText(`Phone: ${invoice.customerPhone}`, {
        x: 50,
        y,
        size: 10,
        font: fontRegular,
        color: textDark,
      });
    }

    if (invoice.customerAddress) {
      y -= 15;
      page.drawText(invoice.customerAddress, {
        x: 50,
        y,
        size: 9,
        font: fontRegular,
        color: textDark,
      });
    }

    // Right: Invoice Metadata (reset y temporarily for right column)
    let metaY = y + (invoice.customerPhone ? 15 : 0) + (invoice.customerAddress ? 15 : 0);
    
    const invNumText = `Invoice #: ${invoice.invoiceNumber}`;
    const invNumWidth = fontBold.widthOfTextAtSize(invNumText, 11);
    page.drawText(invNumText, {
      x: width - 50 - invNumWidth,
      y: metaY,
      size: 11,
      font: fontBold,
      color: textDark,
    });

    metaY -= 15;
    const dateFormatted = new Date(invoice.invoiceDate).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    const dateText = `Date: ${dateFormatted}`;
    const dateWidth = fontRegular.widthOfTextAtSize(dateText, 10);
    page.drawText(dateText, {
      x: width - 50 - dateWidth,
      y: metaY,
      size: 10,
      font: fontRegular,
      color: textDark,
    });

    // Make sure y goes below both columns
    y = Math.min(y, metaY) - 30;

    // --- ITEMS TABLE HEADER ---
    page.drawRectangle({
      x: 50,
      y: y - 5,
      width: width - 100,
      height: 20,
      color: darkBlue,
    });

    page.drawText("#", { x: 60, y, size: 9, font: fontBold, color: rgb(1, 1, 1) });
    page.drawText("Item Name", { x: 90, y, size: 9, font: fontBold, color: rgb(1, 1, 1) });
    page.drawText("Qty", { x: 260, y, size: 9, font: fontBold, color: rgb(1, 1, 1) });
    page.drawText("Unit", { x: 310, y, size: 9, font: fontBold, color: rgb(1, 1, 1) });
    page.drawText("Price/Unit", { x: 370, y, size: 9, font: fontBold, color: rgb(1, 1, 1) });
    page.drawText("Total", { x: 470, y, size: 9, font: fontBold, color: rgb(1, 1, 1) });

    y -= 20;

    // --- ITEMS TABLE ROWS ---
    invoice.items.forEach((item, index) => {
      // Draw row background for alternating rows
      if (index % 2 === 1) {
        page.drawRectangle({
          x: 50,
          y: y - 5,
          width: width - 100,
          height: 18,
          color: lightGray,
        });
      }

      page.drawText(String(index + 1), { x: 60, y, size: 9, font: fontRegular, color: textDark });
      
      // Limit item name size to prevent overflow
      let name = item.itemName;
      if (name.length > 25) name = name.substring(0, 22) + "...";
      page.drawText(name, { x: 90, y, size: 9, font: fontRegular, color: textDark });

      page.drawText(item.quantity.toString(), { x: 260, y, size: 9, font: fontRegular, color: textDark });
      page.drawText(item.unit, { x: 310, y, size: 9, font: fontRegular, color: textDark });
      
      const priceText = `Rs. ${item.pricePerUnit.toFixed(2)}`;
      page.drawText(priceText, { x: 370, y, size: 9, font: fontRegular, color: textDark });

      const totalText = `Rs. ${item.totalPrice.toFixed(2)}`;
      page.drawText(totalText, { x: 470, y, size: 9, font: fontRegular, color: textDark });

      y -= 18;
    });

    y -= 10;
    // Bottom of table line
    page.drawLine({
      start: { x: 50, y },
      end: { x: width - 50, y },
      thickness: 1,
      color: borderGray,
    });

    y -= 25;

    // --- TOTALS SECTION ---
    const subtotalText = `Subtotal: Rs. ${invoice.subtotal.toFixed(2)}`;
    const subtotalWidth = fontRegular.widthOfTextAtSize(subtotalText, 10);
    page.drawText(subtotalText, {
      x: width - 50 - subtotalWidth,
      y,
      size: 10,
      font: fontRegular,
      color: textDark,
    });

    if (invoice.gstRate > 0) {
      y -= 15;
      const gstText = `GST (${invoice.gstRate}%): Rs. ${invoice.gstAmount.toFixed(2)}`;
      const gstWidth = fontRegular.widthOfTextAtSize(gstText, 10);
      page.drawText(gstText, {
        x: width - 50 - gstWidth,
        y,
        size: 10,
        font: fontRegular,
        color: textDark,
      });
    }

    y -= 20;
    const grandTotalText = `Total: Rs. ${invoice.totalAmount.toFixed(2)}`;
    const grandTotalWidth = fontBold.widthOfTextAtSize(grandTotalText, 14);
    page.drawText(grandTotalText, {
      x: width - 50 - grandTotalWidth,
      y,
      size: 14,
      font: fontBold,
      color: saffron,
    });

    // --- FOOTER & NOTES SECTION ---
    if (invoice.notes) {
      y -= 50;
      page.drawText("Notes / Terms:", {
        x: 50,
        y,
        size: 9,
        font: fontBold,
        color: textMuted,
      });
      y -= 12;
      page.drawText(invoice.notes, {
        x: 50,
        y,
        size: 9,
        font: fontRegular,
        color: textDark,
      });
    }

    // Generated watermark at the very bottom
    page.drawText("Generated by ApnaKhata", {
      x: 50,
      y: 35,
      size: 8,
      font: fontRegular,
      color: textMuted,
    });

    // Serialize PDF
    const pdfBytes = await pdfDoc.save();

    return new Response(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="invoice-${invoice.invoiceNumber}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Error generating invoice PDF:", error);
    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500 }
    );
  }
}
