import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleWifTokenService } from './google-wif-token.service';
import type { OcrDocument, OcrToken } from './ocr-evidence-matcher';

@Injectable()
export class PaddleOcrClientService {
  constructor(
    private readonly config: ConfigService,
    private readonly tokens: GoogleWifTokenService,
  ) {}

  // Rendering uses PDFium only; no recognized OCR text is passed to NuExtract.
  async renderPdf(content: Buffer, startPage: number, pageCount: number) {
    const serviceUrl = this.config
      .get<string>('PADDLE_OCR_SERVICE_URL')
      ?.replace(/\/$/, '');
    if (!serviceUrl)
      throw new Error(
        'PADDLE_OCR_SERVICE_URL is required for PDF page rendering.',
      );
    const identityToken = await this.tokens.identityToken(serviceUrl);
    const response = await fetch(`${serviceUrl}/render`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${identityToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        mimeType: 'application/pdf',
        contentBase64: content.toString('base64'),
        startPage,
        pageCount,
      }),
      signal: AbortSignal.timeout(
        Number(this.config.get('PADDLE_OCR_TIMEOUT_MS', 900_000)),
      ),
    });
    if (!response.ok)
      throw new Error(
        `PDF rendering failed (${response.status}). Update the document-processing service to support /render.`,
      );
    return parsePdfRenderResponse(await response.json(), startPage, pageCount);
  }

  async extract(
    content: Buffer,
    mimeType: string,
  ): Promise<OcrDocument | null> {
    const serviceUrl = this.config
      .get<string>('PADDLE_OCR_SERVICE_URL')
      ?.replace(/\/$/, '');
    if (!serviceUrl) return null;
    const identityToken = await this.tokens.identityToken(serviceUrl);
    const response = await fetch(`${serviceUrl}/ocr`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${identityToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        mimeType,
        contentBase64: content.toString('base64'),
      }),
      signal: AbortSignal.timeout(
        Number(this.config.get('PADDLE_OCR_TIMEOUT_MS', 900_000)),
      ),
    });
    if (!response.ok) {
      throw new Error(
        `PaddleOCR failed (${response.status}): ${(await response.text()).slice(0, 500)}`,
      );
    }
    return parsePaddleOcrResponse(await response.json());
  }
}

export function parsePdfRenderResponse(
  input: unknown,
  startPage: number,
  requestedCount: number,
) {
  const root = record(input);
  const pageCount = numeric(root?.pageCount);
  const pages = array(root?.pages);
  if (
    !pageCount ||
    !Number.isInteger(pageCount) ||
    startPage > pageCount ||
    !pages ||
    pages.length !== Math.min(requestedCount, pageCount - startPage + 1)
  )
    throw new Error('PDF renderer returned an incomplete page batch.');
  const images = pages.map((value, index) => {
    const page = record(value);
    if (
      page?.page !== startPage + index ||
      page.mimeType !== 'image/jpeg' ||
      typeof page.contentBase64 !== 'string' ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(page.contentBase64)
    )
      throw new Error('PDF renderer returned an invalid page image.');
    const content = Buffer.from(page.contentBase64, 'base64');
    if (
      !content.length ||
      content.length > 20 * 1024 * 1024 ||
      content[0] !== 0xff ||
      content[1] !== 0xd8
    )
      throw new Error('PDF renderer returned an invalid JPEG.');
    return { content, mimeType: 'image/jpeg', page: startPage + index };
  });
  return { pageCount, images };
}

export function parsePaddleOcrResponse(input: unknown): OcrDocument {
  const root = record(input);
  const normalizedTokens = array(root?.tokens);
  if (normalizedTokens) {
    const width = numeric(root?.width);
    const height = numeric(root?.height);
    if (!width || !height)
      throw new Error('PaddleOCR returned no source image dimensions.');
    const tokens = normalizedTokens
      .map((value) => normalizedToken(value))
      .filter((value): value is OcrToken => value !== null);
    if (!tokens.length) throw new Error('PaddleOCR returned no OCR tokens.');
    const pages = array(root?.pages)
      ?.map((value) => normalizedPage(value))
      .filter((value): value is NonNullable<typeof value> => value !== null);
    return { width, height, ...(pages?.length ? { pages } : {}), tokens };
  }
  const rootArray = Array.isArray(input) ? input : null;
  const pages = rootArray ?? array(root?.ocrResults) ?? array(root?.results);
  if (!pages?.length) throw new Error('PaddleOCR returned no page results.');

  const info = record(root?.dataInfo) ?? record(root?.page);
  const width = numeric(info?.width ?? root?.width);
  const height = numeric(info?.height ?? root?.height);
  if (!width || !height)
    throw new Error('PaddleOCR returned no source image dimensions.');

  const tokens: OcrToken[] = [];
  pages.forEach((page, pageIndex) => {
    const pageRecord = record(page);
    const result = record(pageRecord?.prunedResult) ?? pageRecord;
    if (!result) return;
    const texts = array(result.rec_texts) ?? [];
    const scores = array(result.rec_scores) ?? [];
    const boxes = array(result.rec_boxes) ?? [];
    texts.forEach((text, index) => {
      if (typeof text !== 'string' || !text.trim()) return;
      const bbox = numericBox(boxes[index]);
      if (!bbox) return;
      tokens.push({
        id: `p${pageIndex + 1}_t${index + 1}`,
        page: pageIndex + 1,
        text,
        confidence: numeric(scores[index]) ?? 0,
        bbox,
      });
    });
  });
  if (!tokens.length) throw new Error('PaddleOCR returned no OCR tokens.');
  return { width, height, tokens };
}

function normalizedPage(
  value: unknown,
): NonNullable<OcrDocument['pages']>[number] | null {
  const page = record(value);
  const number = numeric(page?.page);
  const width = numeric(page?.width);
  const height = numeric(page?.height);
  const source = page?.source;
  if (!number || !width || !height) return null;
  const normalizedSource =
    source === 'text' || source === 'ocr' ? source : undefined;
  return {
    page: number,
    width,
    height,
    ...(normalizedSource ? { source: normalizedSource } : {}),
  };
}

function normalizedToken(value: unknown): OcrToken | null {
  const token = record(value);
  const id = token?.id;
  const page = numeric(token?.page);
  const text = token?.text;
  const confidence = token?.confidence;
  const bbox = numericBox(token?.bbox);
  if (
    typeof id !== 'string' ||
    !page ||
    typeof text !== 'string' ||
    typeof confidence !== 'number' ||
    !Number.isFinite(confidence) ||
    !bbox
  )
    return null;
  return { id, page, text, confidence, bbox };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function array(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function numeric(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function numericBox(value: unknown): [number, number, number, number] | null {
  if (
    !Array.isArray(value) ||
    value.length !== 4 ||
    !value.every((item) => typeof item === 'number' && Number.isFinite(item))
  )
    return null;
  const box = value as [number, number, number, number];
  return box[2] > box[0] && box[3] > box[1] ? box : null;
}
