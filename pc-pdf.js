/* =========================================================================
   Project Carter - shared PDF pieces
   -------------------------------------------------------------------------
   Classic script, one global: pcPdf. Every calculator PDF (and the account
   page's sale estimates) opens with the same "THE BOTTOM LINE" box: the
   answer in one or two plain sentences, before any inputs or workings.
   ========================================================================= */
"use strict";

var pcPdf = (function () {
  /* strip characters the built-in PDF fonts can't draw */
  function clean(t) { return String(t).replace(/[–—]/g, "-").replace(/[^\x20-\x7E]/g, ""); }

  /* draws the box with its top edge just above y and returns the new y */
  function bottomLine(doc, L, y, text) {
    if (!text) return y;
    var w = doc.internal.pageSize.getWidth();
    doc.setFont("helvetica", "normal"); doc.setFontSize(11);
    var lines = doc.splitTextToSize(clean(text), w - 2 * L - 36);
    var h = lines.length * 14 + 32;
    doc.setFillColor(234, 242, 248); doc.roundedRect(L, y - 14, w - 2 * L, h, 4, 4, "F");
    doc.setFillColor(95, 161, 208); doc.rect(L, y - 14, 4, h, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(30, 80, 120);
    doc.text("THE BOTTOM LINE", L + 16, y + 2);
    doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(30);
    doc.text(lines, L + 16, y + 19, { lineHeightFactor: 1.15 });
    return y + h + 12;
  }

  return { bottomLine: bottomLine, clean: clean };
})();
