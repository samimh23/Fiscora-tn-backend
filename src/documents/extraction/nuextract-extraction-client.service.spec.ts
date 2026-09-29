import {
  nuextractInstructions,
  nuextractOcrInstructions,
  templateFor,
  NuExtractExtractionClientService,
} from './nuextract-extraction-client.service';

describe('NuExtract extraction contract', () => {
  it('uses a fixed invoice-only template', () => {
    const template = templateFor('invoice');

    expect(template).toMatchObject({
      document_type: ['invoice', 'credit_note', 'receipt'],
      invoice_nature: ['BIENS', 'SERVICES', 'MIXTE', 'INDETERMINE'],
      tax_amount: 'verbatim-string',
      line_items: [
        expect.objectContaining({
          description: 'verbatim-string',
          item_nature: ['BIENS', 'SERVICES', 'INDETERMINE'],
          tax_rate: 'verbatim-string',
        }),
      ],
    });
    expect(template).not.toHaveProperty('bank_statement');
  });

  it('uses a fixed bank-statement-only template', () => {
    const template = templateFor('bank_statement');

    expect(template).toMatchObject({
      document_type: ['bank_statement'],
      bank_statement: {
        transactions: [
          expect.objectContaining({
            description: 'verbatim-string',
            debit: 'verbatim-string',
            credit: 'verbatim-string',
          }),
        ],
      },
    });
    expect(template).not.toHaveProperty('line_items');
    expect(template).not.toHaveProperty('invoice_nature');
  });

  it('keeps OCR coordinates in the input but not in the output template', () => {
    const prompt = nuextractOcrInstructions(
      'invoice',
      [
        {
          id: 'p1_t1',
          page: 1,
          text: 'Total TVA 95,639',
          confidence: 0.99,
          bbox: [10, 20, 30, 40],
        },
      ],
      0,
      1,
    );

    expect(prompt).toContain('OCR_INPUT');
    expect(prompt).toContain('p1_t1');
    expect(prompt).toContain('95,639');
    expect(templateFor('invoice')).not.toHaveProperty('_evidence');
  });

  it('includes validation failures in a targeted reread', () => {
    const prompt = nuextractInstructions('bank_statement', [
      { field: 'transactions.0', message: 'Debit and credit both present' },
    ]);

    expect(prompt).toContain('previous extraction failed');
    expect(prompt).toContain('transactions.0');
    expect(prompt).toContain('Debit and credit both present');
  });

  it('prevents bank identifiers from being mapped as fiscal identifiers', () => {
    const prompt = nuextractInstructions('invoice');

    expect(prompt).toContain('matricule fiscal');
    expect(prompt).toContain('Never use an IBAN, RIB');
  });

  it('classifies invoice nature without relaxing extraction of printed facts', () => {
    const instructions = nuextractInstructions('invoice');
    expect(instructions).toContain(
      'semantic classifications, not verbatim facts',
    );
    expect(instructions).toContain('internet access');
    expect(instructions).toContain('negative adjustment');
    expect(instructions).toContain('do not guess');
    expect(nuextractInstructions('bank_statement')).not.toContain(
      'item_nature',
    );
  });
});

describe('NuExtract visual input', () => {
  afterEach(() => jest.restoreAllMocks());
  it('sends page images with the fixed template, not OCR text', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: '{"document_type":"invoice"}' } }],
        }),
    } as Response);
    const config = {
      get: (name: string, fallback: unknown) =>
        name === 'NUEXTRACT_SERVICE_URL' ? 'https://private.example' : fallback,
    };
    const service = new NuExtractExtractionClientService(
      config as never,
      { identityToken: () => Promise.resolve('test-token') } as never,
    );
    await service.extractImages(
      [{ content: Buffer.from('image bytes'), mimeType: 'image/png', page: 2 }],
      [],
      'invoice',
    );
    const requestBody = fetchMock.mock.calls[0][1]?.body;
    if (typeof requestBody !== 'string')
      throw new Error('Expected a JSON request body');
    const body = JSON.parse(requestBody) as {
      messages: Array<{
        content: Array<{
          type: string;
          image_url?: { url: string };
          text?: string;
        }>;
      }>;
      chat_template_kwargs: { template: string; instructions: string };
    };
    expect(body.messages[0].content).toContainEqual({
      type: 'image_url',
      image_url: {
        url: `data:image/png;base64,${Buffer.from('image bytes').toString('base64')}`,
      },
    });
    expect(body.messages[0].content[0].text).toContain('Document page 2');
    expect(JSON.parse(body.chat_template_kwargs.template)).toEqual(
      templateFor('invoice'),
    );
    expect(body.chat_template_kwargs.instructions).toContain(
      'Never infer a discount',
    );
    expect(body.chat_template_kwargs.instructions).toContain(
      'additional_fields contains only nonempty',
    );
    expect(JSON.stringify(body)).not.toContain('OCR_INPUT');
  });
  it('rejects batches beyond the deployed six-image limit before sending a request', async () => {
    const service = new NuExtractExtractionClientService(
      { get: (_name: string, fallback: unknown) => fallback } as never,
      {} as never,
    );
    await expect(
      service.extractImages(
        Array.from({ length: 7 }, (_, index) => ({
          content: Buffer.from('image'),
          mimeType: 'image/png',
          page: index + 1,
        })),
      ),
    ).rejects.toThrow('one and six');
  });
});
