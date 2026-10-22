declare module "pdfjs-dist/build/pdf.mjs" {
  export function getDocument(options: unknown): {
    promise: Promise<{
      numPages: number;
      getPage: (pageNumber: number) => Promise<{
        getTextContent: () => Promise<{
          items: Array<{ str?: string }>;
        }>;
      }>;
    }>;
  };
}
