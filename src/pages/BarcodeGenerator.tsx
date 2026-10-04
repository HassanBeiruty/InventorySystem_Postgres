import React, { useState, useRef, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { InvoicePageHeader } from "@/components/page-ui/InvoicePageHeader";
import { SectionCard } from "@/components/page-ui/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Scan, Download, Image as ImageIcon, Printer, Lightbulb, ListChecks } from "lucide-react";
import { useTranslation } from "react-i18next";
// @ts-ignore - jsbarcode doesn't have TypeScript definitions
import JsBarcode from "jsbarcode";
import { escapeHtml } from "@/utils/escapeHtml";

const BarcodeGenerator = () => {
  const { t } = useTranslation();
  const [textData, setTextData] = useState<string>("");
  const [barcodeGenerated, setBarcodeGenerated] = useState<boolean>(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Generate barcode when textData changes
  useEffect(() => {
    if (!textData.trim()) {
      setBarcodeGenerated(false);
      return;
    }

    // Wait for next tick to ensure canvas is in DOM
    const timer = setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas) {
        setBarcodeGenerated(false);
        return;
      }
      
      try {
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          console.error("Could not get canvas context");
          setBarcodeGenerated(false);
          return;
        }
        
        // Set canvas size for better quality
        canvas.width = 800;
        canvas.height = 200;
        
        // Fill white background
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Generate barcode on canvas
        JsBarcode(canvas, textData.trim(), {
          format: "CODE128",
          width: 2,
          height: 100,
          displayValue: true,
          fontSize: 20,
          margin: 10,
          background: "#ffffff",
          lineColor: "#000000",
        });
        
        setBarcodeGenerated(true);
      } catch (error) {
        console.error("Error generating barcode:", error);
        setBarcodeGenerated(false);
      }
    }, 100);
    
    return () => clearTimeout(timer);
  }, [textData]);

  const handleDownload = () => {
    if (!canvasRef.current || !textData.trim()) {
      return;
    }

    try {
      // Convert canvas to blob (PNG for best quality)
      canvasRef.current.toBlob(
        (blob) => {
          if (!blob) {
            console.error("Failed to create blob");
            return;
          }

          // Create download link
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `barcode_${textData.trim()}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        },
        "image/png",
        1.0 // Quality (1.0 = 100%)
      );
    } catch (error) {
      console.error("Error downloading barcode:", error);
    }
  };

  const handlePrint = () => {
    if (!canvasRef.current || !textData.trim()) {
      return;
    }

    try {
      // Use the same canvas as displayed (800x200 with same barcode settings)
      // Convert to data URL directly from the displayed canvas
      const dataUrl = canvasRef.current.toDataURL("image/png", 1.0);
      
      // Create a new window for printing
      const printWindow = window.open("", "_blank");
      if (!printWindow) {
        alert("Please allow popups to print the barcode");
        return;
      }

      // Write HTML optimized for thermal printing (58mm labels)
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Barcode Print - ${escapeHtml(textData.trim())}</title>
            <style>
              * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
              }
              @media print {
                @page {
                  size: auto;
                  margin: 0;
                }
                html, body {
                  width: 800px;
                  height: 200px;
                  margin: 0;
                  padding: 0;
                  overflow: hidden;
                }
                body {
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  page-break-after: avoid;
                  page-break-inside: avoid;
                }
                img {
                  width: 800px;
                  height: 200px;
                  display: block;
                  page-break-after: avoid;
                  page-break-inside: avoid;
                  object-fit: contain;
                }
              }
              @media screen {
                body {
                  margin: 0;
                  padding: 20px;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  min-height: 100vh;
                  background: white;
                }
                img {
                  width: 800px;
                  height: 200px;
                }
              }
              img {
                image-rendering: crisp-edges;
                image-rendering: -webkit-optimize-contrast;
              }
            </style>
          </head>
          <body>
            <img src="${dataUrl}" alt="Barcode ${escapeHtml(textData.trim())}" />
            <script>
              window.onload = function() {
                window.print();
                window.onafterprint = function() {
                  window.close();
                };
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    } catch (error) {
      console.error("Error printing barcode:", error);
      alert("Failed to open print dialog. Please try downloading and printing manually.");
    }
  };

  const handleClear = () => {
    setTextData("");
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }
    setBarcodeGenerated(false);
  };

  return (
    <DashboardLayout>
      <div className="space-y-4 animate-fade-in">
        <InvoicePageHeader
          icon={Scan}
          title="Barcode Generator"
          description="Generate Code 128 barcode from text data"
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Input Section */}
          <SectionCard
            icon={Scan}
            title="Enter Text Data"
            description="Enter the text you want to convert to a Code 128 barcode"
            bodyClassName="space-y-3"
          >
              <div className="space-y-2">
                <Label htmlFor="textData" className="text-[11px] font-medium">
                  Text Data <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="textData"
                  type="text"
                  placeholder="Enter text to generate barcode..."
                  value={textData}
                  onChange={(e) => setTextData(e.target.value)}
                  className="h-8 text-[13px]"
                  autoFocus
                />
                <p className="text-[11px] text-muted-foreground">
                  Code 128 supports alphanumeric characters (A-Z, 0-9, and special characters)
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleClear}
                  disabled={!textData.trim()}
                  className="flex-1 h-8 text-[13px]"
                >
                  Clear
                </Button>
              </div>
          </SectionCard>

          {/* Barcode Display Section */}
          <SectionCard
            icon={ImageIcon}
            title="Generated Barcode"
            description="Preview and download your barcode"
            bodyClassName="space-y-3"
          >
              {/* Always render canvas so JsBarcode can work on it */}
              <div className="flex items-center justify-center p-4 bg-white rounded-lg border-2 border-dashed border-primary/20 overflow-auto min-h-[200px] relative">
                {/* Canvas always in DOM and visible for JsBarcode */}
                <canvas
                  ref={canvasRef}
                  width={800}
                  height={200}
                  className="max-w-full h-auto"
                  style={{ imageRendering: "crisp-edges" }}
                />
                {/* Placeholder overlay when no barcode */}
                {!barcodeGenerated && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                    <div className="w-16 h-16 rounded-full bg-primary-light flex items-center justify-center mb-3">
                      <Scan className="w-8 h-8 text-primary/60" />
                    </div>
                    <p className="text-muted-foreground text-[13px]">
                      Enter text data to generate barcode
                    </p>
                  </div>
                )}
              </div>

              {barcodeGenerated && (
                <>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      onClick={handlePrint}
                      className="flex-1 h-8 text-[13px]"
                      variant="default"
                    >
                      <Printer className="w-4 h-4 me-2" />
                      Print
                    </Button>
                    <Button
                      onClick={handleDownload}
                      className="flex-1 h-8 text-[13px]"
                      variant="outline"
                    >
                      <Download className="w-4 h-4 me-2" />
                      Download PNG
                    </Button>
                  </div>

                  <div className="text-[12px] text-muted-foreground text-center">
                    <p>Barcode: <span className="font-mono font-semibold">{textData.trim()}</span></p>
                    <p className="mt-1">Format: Code 128</p>
                  </div>
                </>
              )}
          </SectionCard>
        </div>

        {/* Instructions */}
        <SectionCard icon={ListChecks} title="How to Use" bodyClassName="text-[12px] text-muted-foreground space-y-2">
            <ol className="list-decimal list-inside space-y-1">
              <li>Enter the text data you want to convert to a barcode in the input field</li>
              <li>The barcode will be generated automatically as you type</li>
              <li>Preview the generated Code 128 barcode on the right</li>
              <li>Click "Print" to directly print to your thermal label printer</li>
              <li>Or click "Download PNG" to save the barcode image for later use</li>
            </ol>
            <p className="mt-2 flex items-start gap-1.5 text-[12px] font-semibold text-primary-strong">
              <Lightbulb className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
              Tip: The Print button opens a print dialog optimized for thermal label printers (58mm/80mm width)
            </p>
        </SectionCard>
      </div>
    </DashboardLayout>
  );
};

export default BarcodeGenerator;
