export interface ExtractionValidationIssue {
  [key: string]: unknown;
  code: string;
  field: string;
  severity: 'ERROR' | 'WARNING';
  message: string;
}

export interface ExtractionValidationResult {
  normalizedData: Record<string, unknown>;
  issues: ExtractionValidationIssue[];
}

export class InvoiceExtractionValidator {
  validate(input: Record<string, unknown>): ExtractionValidationResult {
    const normalizedData = structuredClone(input);
    const issues: ExtractionValidationIssue[] = [];
    const documentType = this.text(input.document_type);
    if (!documentType) {
      issues.push(
        this.error(
          'DOCUMENT_TYPE_MISSING',
          'document_type',
          'Le type de document est absent.',
        ),
      );
    }

    const supplier = this.record(input.supplier);
    if (!this.text(supplier?.name)) {
      issues.push(
        this.error(
          'SUPPLIER_MISSING',
          'supplier.name',
          'Le fournisseur est absent ou illisible.',
        ),
      );
    }
    if (!this.text(input.document_number)) {
      issues.push(
        this.warning(
          'DOCUMENT_NUMBER_MISSING',
          'document_number',
          'Le numéro du document est absent ou illisible.',
        ),
      );
    }

    const issueDate = this.text(input.issue_date);
    if (!issueDate || Number.isNaN(Date.parse(issueDate))) {
      issues.push(
        this.warning(
          'ISSUE_DATE_INVALID',
          'issue_date',
          'La date du document est absente ou invalide.',
        ),
      );
    }

    const subtotal = this.amount(input.subtotal_excl_tax);
    const tax = this.amount(input.tax_amount);
    const fodec = this.amount(input.fodec_amount) ?? 0;
    const stamp = this.amount(input.stamp_tax) ?? 0;
    const otherTaxes = Array.isArray(input.other_taxes)
      ? input.other_taxes
          .map((item) => this.record(item))
          .filter((item): item is Record<string, unknown> => Boolean(item))
      : [];
    const otherTaxTotal = otherTaxes.reduce(
      (sum, item) => sum + (this.amount(item.amount) ?? 0),
      0,
    );
    const total = this.amount(input.total_incl_tax);
    const due = this.amount(input.amount_due);
    const financialFields = [
      ['subtotal_excl_tax', subtotal],
      ['tax_amount', tax],
      ['fodec_amount', this.amount(input.fodec_amount)],
      ['stamp_tax', this.amount(input.stamp_tax)],
      ['total_incl_tax', total],
      ['amount_due', due],
    ] as const;
    for (const [field, value] of financialFields) {
      if (value != null) normalizedData[field] = value;
      if (value != null && value < 0) {
        issues.push(
          this.error(
            'NEGATIVE_AMOUNT',
            field,
            `${field} ne peut pas être négatif.`,
          ),
        );
      }
    }
    otherTaxes.forEach((item, index) => {
      const value = this.amount(item.amount);
      if (value != null && value < 0) {
        issues.push(
          this.error(
            'NEGATIVE_AMOUNT',
            `other_taxes.${index}.amount`,
            `La taxe complémentaire ${index + 1} ne peut pas être négative.`,
          ),
        );
      }
    });
    normalizedData.other_taxes = otherTaxes.map((item) => ({
      ...item,
      amount: this.amount(item.amount),
    }));
    if (subtotal != null && tax != null && total != null) {
      const difference = Math.abs(
        subtotal + tax + fodec + stamp + otherTaxTotal - total,
      );
      if (difference > 0.02) {
        issues.push(
          this.error(
            'TOTAL_MISMATCH',
            'total_incl_tax',
            `Le total diffère de HT + TVA + FODEC + autres taxes + timbre de ${difference.toFixed(3)}.`,
          ),
        );
      }
    }
    if (due != null && total != null && due - total > 0.02) {
      issues.push(
        this.warning(
          'AMOUNT_DUE_ABOVE_TOTAL',
          'amount_due',
          'Le montant dû dépasse le total TTC.',
        ),
      );
    }

    const lines = Array.isArray(input.line_items) ? input.line_items : [];
    const normalizedLines = lines.map((line) => {
      const item = this.record(line);
      if (!item) return {};
      return {
        ...item,
        quantity: this.amount(item.quantity),
        unit_price: this.amount(item.unit_price),
        tax_rate: this.amount(item.tax_rate),
        line_total: this.amount(item.line_total),
      };
    });
    normalizedData.line_items = normalizedLines;
    normalizedLines.forEach((line, index) => {
      const item = this.record(line);
      if (!item) return;
      const quantity = this.amount(item.quantity);
      const unitPrice = this.amount(item.unit_price);
      const lineTotal = this.amount(item.line_total);
      if (quantity != null && unitPrice != null && lineTotal != null) {
        const difference = Math.abs(quantity * unitPrice - lineTotal);
        if (difference > Math.max(0.02, Math.abs(lineTotal) * 0.01)) {
          issues.push(
            this.warning(
              'LINE_TOTAL_MISMATCH',
              `line_items.${index}.line_total`,
              `La ligne ${index + 1} ne correspond pas à quantité × prix unitaire.`,
            ),
          );
        }
      }
    });

    return { normalizedData, issues };
  }

  private record(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private text(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private amount(value: unknown): number | null {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value !== 'string' || !value.trim()) return null;
    const compact = value.replace(/[\s\u00a0]/g, '').replace(/[^0-9,.-]/g, '');
    const comma = compact.lastIndexOf(',');
    const dot = compact.lastIndexOf('.');
    const separator = Math.max(comma, dot);
    const decimal =
      separator < 0
        ? compact
        : `${compact.slice(0, separator).replace(/[,.]/g, '')}.${compact.slice(separator + 1).replace(/[,.]/g, '')}`;
    const parsed = Number(decimal);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private error(
    code: string,
    field: string,
    message: string,
  ): ExtractionValidationIssue {
    return { code, field, severity: 'ERROR', message };
  }

  private warning(
    code: string,
    field: string,
    message: string,
  ): ExtractionValidationIssue {
    return { code, field, severity: 'WARNING', message };
  }
}
