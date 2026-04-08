"use client";

import { Button } from "@/components/ui/button";

interface ExportPDFProps {
  grandTotal: number;
  envelopeData: Array<{ name: string; total: number; color: string }>;
  positions: Array<{ ticker: string; label: string; current_value: number; pnl: number | null; envelope_name: string }>;
}

export default function ExportPDF({ grandTotal, envelopeData, positions }: ExportPDFProps) {
  async function handleExport() {
    const { jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");

    const doc = new jsPDF();
    const now = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });

    // Title
    doc.setFontSize(20);
    doc.setTextColor(52, 211, 153);
    doc.text("Bilan Patrimonial", 14, 22);

    doc.setFontSize(10);
    doc.setTextColor(156, 163, 175);
    doc.text(now, 14, 30);

    // Total
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text(`Total : ${grandTotal.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}`, 14, 42);

    // Envelopes table
    doc.setFontSize(12);
    doc.setTextColor(209, 213, 219);
    doc.text("Répartition par enveloppe", 14, 54);

    autoTable(doc, {
      startY: 58,
      head: [["Enveloppe", "Valeur", "Poids"]],
      body: envelopeData.map((e) => [
        e.name,
        e.total.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }),
        grandTotal > 0 ? ((e.total / grandTotal) * 100).toFixed(1) + "%" : "—",
      ]),
      theme: "grid",
      styles: { fillColor: [13, 17, 23], textColor: [209, 213, 219], fontSize: 9, lineColor: [55, 65, 81], lineWidth: 0.3 },
      headStyles: { fillColor: [22, 27, 34], textColor: [156, 163, 175], fontStyle: "bold" },
    });

    // Top positions
    const y = ((doc as unknown as Record<string, Record<string, number>>).lastAutoTable?.finalY) || 100;
    doc.setFontSize(12);
    doc.setTextColor(209, 213, 219);
    doc.text("Top 10 positions", 14, y + 14);

    const top10 = [...positions].sort((a, b) => b.current_value - a.current_value).slice(0, 10);

    autoTable(doc, {
      startY: y + 18,
      head: [["Ticker", "Libellé", "Valeur", "+/- Value", "Enveloppe"]],
      body: top10.map((p) => [
        p.ticker,
        p.label.substring(0, 30),
        p.current_value.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }),
        p.pnl !== null ? (p.pnl >= 0 ? "+" : "") + p.pnl.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }) : "—",
        p.envelope_name,
      ]),
      theme: "grid",
      styles: { fillColor: [13, 17, 23], textColor: [209, 213, 219], fontSize: 8, lineColor: [55, 65, 81], lineWidth: 0.3 },
      headStyles: { fillColor: [22, 27, 34], textColor: [156, 163, 175], fontStyle: "bold" },
    });

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(107, 114, 128);
    doc.text("Généré par Patrimoine Dashboard", 14, 285);

    doc.save(`bilan-patrimonial-${new Date().toISOString().split("T")[0]}.pdf`);
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      className="border-gray-700 text-gray-400 hover:bg-[#161b22] hover:text-white text-xs"
    >
      Export PDF
    </Button>
  );
}
