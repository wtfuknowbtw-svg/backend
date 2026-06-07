import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { verifyJWT, unauthorizedResponse } from "@/middleware/auth";
import { prisma } from "@/lib/prisma";
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";

// ─── Color Palette ───────────────────────────────────────────────
const COLORS = {
  primary: rgb(26 / 255, 60 / 255, 110 / 255),       // #1A3C6E deep blue
  accent: rgb(245 / 255, 166 / 255, 35 / 255),        // #F5A623 gold/orange
  white: rgb(1, 1, 1),
  background: rgb(1, 1, 1),                            // #FFFFFF
  textDark: rgb(33 / 255, 37 / 255, 41 / 255),         // #212529
  textMuted: rgb(134 / 255, 142 / 255, 150 / 255),     // #868E96
  textLight: rgb(173 / 255, 181 / 255, 189 / 255),     // #ADB5BD
  rowAlt: rgb(248 / 255, 249 / 255, 250 / 255),        // #F8F9FA
  border: rgb(222 / 255, 226 / 255, 230 / 255),        // #DEE2E6
  badgeRed: rgb(220 / 255, 53 / 255, 69 / 255),        // #DC3545
  badgeGreen: rgb(40 / 255, 167 / 255, 69 / 255),      // #28A745
  badgeOrange: rgb(253 / 255, 126 / 255, 20 / 255),    // #FD7E14
};

// ─── Helpers ─────────────────────────────────────────────────────

/** Format number as Indian currency: Rs. 1,23,456.00 */
function formatINR(amount: number): string {
  const fixed = amount.toFixed(2);
  const [intPart, decPart] = fixed.split(".");
  // Indian comma grouping: last 3 digits, then groups of 2
  const lastThree = intPart.slice(-3);
  const rest = intPart.slice(0, -3);
  const formatted = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + (rest ? "," : "") + lastThree;
  // Note: Using "Rs." because pdf-lib standard fonts (Helvetica) cannot render the ₹ symbol
  return `Rs. ${formatted}.${decPart}`;
}

/** Draw right-aligned text and return its width */
function drawRight(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  size: number,
  font: PDFFont,
  color: ReturnType<typeof rgb>
) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: x - w, y, size, font, color });
  return w;
}

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

    // ═══════════════════════════════════════════════════════════════
    // Create PDF Document — A4 (595.27 × 841.89 pt)
    // ═══════════════════════════════════════════════════════════════
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.27, 841.89]);
    const { width, height } = page.getSize();

    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const marginLeft = 50;
    const marginRight = width - 50;
    const contentWidth = marginRight - marginLeft;

    let y = height - 50;

    // ─── HEADER SECTION ──────────────────────────────────────────
    // Left: Brand
    page.drawText("ApnaKhata", {
      x: marginLeft,
      y: y - 5,
      size: 28,
      font: fontBold,
      color: COLORS.accent,
    });

    // Tagline below brand (using basic Latin approximation since pdf-lib can't render Devanagari natively)
    page.drawText("Your Trusted Hisaab-Kitaab", {
      x: marginLeft,
      y: y - 22,
      size: 9,
      font: fontRegular,
      color: COLORS.textMuted,
    });

    // Right: Business Info
    const busName = invoice.business.name || invoice.business.ownerName || "My Business";
    const busPhone = invoice.business.phone;
    const busGstin = invoice.business.gstin;
    // address field: use if available on business model
    const busAddress = (invoice.business as any).address || null;

    let rightY = y;

    // Business Name — bold, 18px, deep blue
    drawRight(page, busName, marginRight, rightY, 16, fontBold, COLORS.primary);
    rightY -= 16;

    // Phone
    drawRight(page, busPhone, marginRight, rightY, 10, fontRegular, COLORS.textDark);
    rightY -= 14;

    // GSTIN (conditional)
    if (busGstin) {
      drawRight(page, `GSTIN: ${busGstin}`, marginRight, rightY, 9, fontRegular, COLORS.textMuted);
      rightY -= 13;
    }

    // Address (conditional)
    if (busAddress) {
      drawRight(page, busAddress, marginRight, rightY, 9, fontRegular, COLORS.textMuted);
      rightY -= 13;
    }

    y -= 45;

    // ─── Gold Divider ────────────────────────────────────────────
    page.drawLine({
      start: { x: marginLeft, y },
      end: { x: marginRight, y },
      thickness: 1.5,
      color: COLORS.accent,
    });

    y -= 30;

    // ─── INVOICE INFO SECTION ────────────────────────────────────
    // Left: INVOICE title + metadata
    page.drawText("INVOICE", {
      x: marginLeft,
      y,
      size: 22,
      font: fontBold,
      color: COLORS.primary,
    });

    y -= 18;
    page.drawText(invoice.invoiceNumber, {
      x: marginLeft,
      y,
      size: 11,
      font: fontBold,
      color: COLORS.textDark,
    });

    y -= 14;
    const dateFormatted = new Date(invoice.invoiceDate).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    page.drawText(`Date: ${dateFormatted}`, {
      x: marginLeft,
      y,
      size: 10,
      font: fontRegular,
      color: COLORS.textMuted,
    });

    // Right: Status badge
    const invoiceStatus = (invoice as any).status || "UNPAID";
    const statusLabel = invoiceStatus.toUpperCase();
    let badgeColor = COLORS.badgeRed;
    if (statusLabel === "PAID") badgeColor = COLORS.badgeGreen;
    else if (statusLabel === "PARTIAL") badgeColor = COLORS.badgeOrange;

    const badgeTextWidth = fontBold.widthOfTextAtSize(statusLabel, 10);
    const badgePadX = 12;
    const badgePadY = 4;
    const badgeW = badgeTextWidth + badgePadX * 2;
    const badgeH = 18;
    const badgeX = marginRight - badgeW;
    const badgeY = y + 18; // align with invoice number row

    page.drawRectangle({
      x: badgeX,
      y: badgeY - badgePadY,
      width: badgeW,
      height: badgeH,
      color: badgeColor,
      borderColor: badgeColor,
      borderWidth: 0,
    });

    page.drawText(statusLabel, {
      x: badgeX + badgePadX,
      y: badgeY,
      size: 10,
      font: fontBold,
      color: COLORS.white,
    });

    // Due date (if set)
    const dueDate = (invoice as any).dueDate;
    if (dueDate) {
      const dueDateStr = new Date(dueDate).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
      drawRight(page, `Due: ${dueDateStr}`, marginRight, badgeY - 22, 10, fontRegular, COLORS.textMuted);
    }

    y -= 30;

    // ─── Thin separator ──────────────────────────────────────────
    page.drawLine({
      start: { x: marginLeft, y },
      end: { x: marginRight, y },
      thickness: 0.5,
      color: COLORS.border,
    });

    y -= 25;

    // ─── CUSTOMER SECTION ────────────────────────────────────────
    page.drawText("Bill To:", {
      x: marginLeft,
      y,
      size: 9,
      font: fontRegular,
      color: COLORS.textMuted,
    });

    y -= 16;
    page.drawText(invoice.customerName, {
      x: marginLeft,
      y,
      size: 14,
      font: fontBold,
      color: COLORS.textDark,
    });

    if (invoice.customerPhone) {
      y -= 14;
      page.drawText(invoice.customerPhone, {
        x: marginLeft,
        y,
        size: 10,
        font: fontRegular,
        color: COLORS.textDark,
      });
    }

    if (invoice.customerAddress) {
      y -= 14;
      page.drawText(invoice.customerAddress, {
        x: marginLeft,
        y,
        size: 10,
        font: fontRegular,
        color: COLORS.textMuted,
      });
    }

    y -= 30;

    // ═══════════════════════════════════════════════════════════════
    // ITEMS TABLE
    // ═══════════════════════════════════════════════════════════════

    // Column positions
    const col = {
      num: marginLeft + 10,        // #
      name: marginLeft + 35,       // Item Name
      qty: marginLeft + 230,       // Qty
      unit: marginLeft + 280,      // Unit
      price: marginLeft + 340,     // Price/Unit
      total: marginRight - 10,     // Total (right-aligned)
    };

    const rowHeight = 22;

    // ─── Table Header ────────────────────────────────────────────
    page.drawRectangle({
      x: marginLeft,
      y: y - 6,
      width: contentWidth,
      height: rowHeight + 4,
      color: COLORS.primary,
    });

    const headerY = y;
    page.drawText("#", { x: col.num, y: headerY, size: 9, font: fontBold, color: COLORS.white });
    page.drawText("Item Name", { x: col.name, y: headerY, size: 9, font: fontBold, color: COLORS.white });
    page.drawText("Qty", { x: col.qty, y: headerY, size: 9, font: fontBold, color: COLORS.white });
    page.drawText("Unit", { x: col.unit, y: headerY, size: 9, font: fontBold, color: COLORS.white });
    page.drawText("Price/Unit", { x: col.price, y: headerY, size: 9, font: fontBold, color: COLORS.white });
    drawRight(page, "Total", col.total, headerY, 9, fontBold, COLORS.white);

    y -= rowHeight + 4;

    // ─── Table Rows ──────────────────────────────────────────────
    invoice.items.forEach((item, index) => {
      // Alternating row backgrounds
      if (index % 2 === 1) {
        page.drawRectangle({
          x: marginLeft,
          y: y - 6,
          width: contentWidth,
          height: rowHeight,
          color: COLORS.rowAlt,
        });
      }

      page.drawText(String(index + 1), {
        x: col.num,
        y,
        size: 9,
        font: fontRegular,
        color: COLORS.textDark,
      });

      // Truncate long names
      let name = item.itemName;
      if (fontRegular.widthOfTextAtSize(name, 9) > (col.qty - col.name - 10)) {
        while (fontRegular.widthOfTextAtSize(name + "...", 9) > (col.qty - col.name - 10) && name.length > 0) {
          name = name.slice(0, -1);
        }
        name += "...";
      }
      page.drawText(name, { x: col.name, y, size: 9, font: fontRegular, color: COLORS.textDark });

      page.drawText(item.quantity.toString(), {
        x: col.qty,
        y,
        size: 9,
        font: fontRegular,
        color: COLORS.textDark,
      });

      page.drawText(item.unit, {
        x: col.unit,
        y,
        size: 9,
        font: fontRegular,
        color: COLORS.textDark,
      });

      page.drawText(formatINR(item.pricePerUnit), {
        x: col.price,
        y,
        size: 9,
        font: fontRegular,
        color: COLORS.textDark,
      });

      drawRight(page, formatINR(item.totalPrice), col.total, y, 9, fontRegular, COLORS.textDark);

      y -= rowHeight;
    });

    // Bottom of table line
    y -= 4;
    page.drawLine({
      start: { x: marginLeft, y },
      end: { x: marginRight, y },
      thickness: 0.5,
      color: COLORS.border,
    });

    y -= 25;

    // ═══════════════════════════════════════════════════════════════
    // TOTALS SECTION (right-aligned)
    // ═══════════════════════════════════════════════════════════════
    const totalsX = marginRight;
    const totalsLabelX = marginRight - 160;

    // Subtotal
    page.drawText("Subtotal", {
      x: totalsLabelX,
      y,
      size: 10,
      font: fontRegular,
      color: COLORS.textMuted,
    });
    drawRight(page, formatINR(invoice.subtotal), totalsX, y, 10, fontRegular, COLORS.textDark);

    // GST (conditional)
    if (invoice.gstRate > 0) {
      y -= 16;
      page.drawText(`GST (${invoice.gstRate}%)`, {
        x: totalsLabelX,
        y,
        size: 10,
        font: fontRegular,
        color: COLORS.textMuted,
      });
      drawRight(page, formatINR(invoice.gstAmount), totalsX, y, 10, fontRegular, COLORS.textDark);
    }

    // Discount (conditional — future-safe)
    const discount = (invoice as any).discount || 0;
    if (discount > 0) {
      y -= 16;
      page.drawText("Discount", {
        x: totalsLabelX,
        y,
        size: 10,
        font: fontRegular,
        color: COLORS.textMuted,
      });
      drawRight(page, `-${formatINR(discount)}`, totalsX, y, 10, fontRegular, COLORS.badgeRed);
    }

    // Divider before total
    y -= 14;
    page.drawLine({
      start: { x: totalsLabelX, y },
      end: { x: totalsX, y },
      thickness: 1,
      color: COLORS.border,
    });

    // Grand total
    y -= 18;
    page.drawText("Total", {
      x: totalsLabelX,
      y,
      size: 14,
      font: fontBold,
      color: COLORS.primary,
    });
    drawRight(page, formatINR(invoice.totalAmount), totalsX, y, 14, fontBold, COLORS.accent);

    // ═══════════════════════════════════════════════════════════════
    // UPI PAYMENT SECTION (conditional)
    // ═══════════════════════════════════════════════════════════════
    const upiId = (invoice.business as any).upiId || null;
    if (upiId) {
      y -= 40;

      // Box border
      const upiBoxWidth = 200;
      const upiBoxHeight = 50;
      page.drawRectangle({
        x: marginLeft,
        y: y - upiBoxHeight + 15,
        width: upiBoxWidth,
        height: upiBoxHeight,
        borderColor: COLORS.primary,
        borderWidth: 1,
        color: COLORS.white,
      });

      page.drawText("Pay via UPI", {
        x: marginLeft + 12,
        y: y,
        size: 10,
        font: fontBold,
        color: COLORS.primary,
      });

      page.drawText(upiId, {
        x: marginLeft + 12,
        y: y - 16,
        size: 10,
        font: fontRegular,
        color: COLORS.textDark,
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // FOOTER
    // ═══════════════════════════════════════════════════════════════
    const footerY = 55;

    // Left: Notes / Terms
    if (invoice.notes) {
      page.drawText("Terms & Conditions:", {
        x: marginLeft,
        y: footerY + 15,
        size: 8,
        font: fontBold,
        color: COLORS.textMuted,
      });

      // Wrap notes text (simple truncation for single-line)
      const notesText = invoice.notes.length > 60
        ? invoice.notes.substring(0, 57) + "..."
        : invoice.notes;
      page.drawText(notesText, {
        x: marginLeft,
        y: footerY + 3,
        size: 8,
        font: fontRegular,
        color: COLORS.textMuted,
      });
    }

    // Center: Thank you
    const thankYouText = "Thank you for your business!";
    const thankYouWidth = fontRegular.widthOfTextAtSize(thankYouText, 9);
    page.drawText(thankYouText, {
      x: (width - thankYouWidth) / 2,
      y: 30,
      size: 9,
      font: fontRegular,
      color: COLORS.textMuted,
    });

    // Right: Powered by
    drawRight(page, "Powered by ApnaKhata", marginRight, footerY + 5, 8, fontRegular, COLORS.textLight);

    // ─── Bottom accent line ──────────────────────────────────────
    page.drawLine({
      start: { x: marginLeft, y: 22 },
      end: { x: marginRight, y: 22 },
      thickness: 2,
      color: COLORS.accent,
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
