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

    if (documentType === 'bank_statement') {
      return this.validateBankStatement(input, normalizedData, issues);
    }
    if (documentType === 'other') {
      issues.push(
        this.warning(
          'DOCUMENT_TYPE_CONFIRMATION_REQUIRED',
          'document_type',
          'Le document n’a pas été reconnu avec suffisamment de précision. Confirmez son type avant traitement.',
        ),
      );
      return { normalizedData, issues };
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

    let grossSubtotal = this.amount(input.gross_subtotal_excl_tax);
    let discountAmount = this.amount(input.global_discount_amount);
    let discountRate = this.amount(input.global_discount_rate);
    if (discountRate != null && discountRate > 1) discountRate /= 100;
    let subtotal = this.amount(input.subtotal_excl_tax);
    if (subtotal == null && grossSubtotal != null && discountAmount != null)
      subtotal = grossSubtotal - discountAmount;
    if (subtotal == null && grossSubtotal != null && discountRate != null)
      subtotal = grossSubtotal * (1 - discountRate);
    if (grossSubtotal == null && subtotal != null && discountAmount != null)
      grossSubtotal = subtotal + discountAmount;
    if (discountAmount == null && grossSubtotal != null && subtotal != null)
      discountAmount = grossSubtotal - subtotal;
    if (
      discountRate == null &&
      grossSubtotal != null &&
      grossSubtotal > 0 &&
      discountAmount != null
    )
      discountRate = discountAmount / grossSubtotal;
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
      ['gross_subtotal_excl_tax', grossSubtotal],
      ['global_discount_amount', discountAmount],
      ['global_discount_rate', discountRate],
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
    if (discountRate != null && discountRate > 1) {
      issues.push(
        this.error(
          'GLOBAL_DISCOUNT_RATE_INVALID',
          'global_discount_rate',
          'Le taux de remise globale doit être compris entre 0 et 100 %.',
        ),
      );
    }
    if (grossSubtotal != null && discountAmount != null && subtotal != null) {
      const difference = Math.abs(grossSubtotal - discountAmount - subtotal);
      if (difference > 0.02) {
        issues.push(
          this.error(
            'GLOBAL_DISCOUNT_MISMATCH',
            'global_discount_amount',
            `La remise globale ne correspond pas à HT brut - base HT de ${difference.toFixed(3)}.`,
          ),
        );
      }
    }
    if (subtotal != null && tax != null && total != null) {
      const totalBeforeStamp = subtotal + tax + fodec + otherTaxTotal;
      const differenceBeforeStamp = Math.abs(totalBeforeStamp - total);
      const differenceWithStamp = Math.abs(totalBeforeStamp + stamp - total);
      const difference = Math.min(differenceBeforeStamp, differenceWithStamp);
      if (difference > 0.02) {
        issues.push(
          this.error(
            'TOTAL_MISMATCH',
            'total_incl_tax',
            `Le total TTC ne correspond ni à la base HT + TVA + FODEC + autres taxes, ni à ce total avec timbre. Écart minimal : ${difference.toFixed(3)}.`,
          ),
        );
      }
      if (due != null && difference <= 0.02) {
        const totalAlreadyIncludesStamp =
          differenceWithStamp <= differenceBeforeStamp;
        const expectedDue = totalAlreadyIncludesStamp ? total : total + stamp;
        const dueDifference = Math.abs(expectedDue - due);
        if (dueDifference > 0.02) {
          issues.push(
            this.error(
              'NET_PAYABLE_MISMATCH',
              'amount_due',
              `Le net à payer diffère du TTC après timbre de ${dueDifference.toFixed(3)}.`,
            ),
          );
        }
      }
    }

    const lines = Array.isArray(input.line_items) ? input.line_items : [];
    const normalizedLines = lines.map((line) => {
      const item = this.record(line);
      if (!item) return {};
      return {
        ...item,
        quantity: this.amount(item.quantity),
        unit_price: this.amount(item.unit_price),
        discount_rate: this.rate(item.discount_rate),
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
      const discountRate = this.rate(item.discount_rate) ?? 0;
      const lineTotal = this.amount(item.line_total);
      if (quantity != null && unitPrice != null && lineTotal != null) {
        const difference = Math.abs(
          quantity * unitPrice * (1 - discountRate) - lineTotal,
        );
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

  private validateBankStatement(
    input: Record<string, unknown>,
    normalizedData: Record<string, unknown>,
    issues: ExtractionValidationIssue[],
  ): ExtractionValidationResult {
    const statement = this.record(input.bank_statement);
    if (!statement) {
      issues.push(
        this.error(
          'BANK_STATEMENT_DATA_MISSING',
          'bank_statement',
          'Les données du relevé bancaire sont absentes.',
        ),
      );
      return { normalizedData, issues };
    }

    const periodStart = this.isoDate(statement.period_start);
    const periodEnd = this.isoDate(statement.period_end);
    if (!periodStart) {
      issues.push(
        this.error(
          'BANK_PERIOD_START_INVALID',
          'bank_statement.period_start',
          'La date de début du relevé est absente ou invalide.',
        ),
      );
    }
    if (!periodEnd) {
      issues.push(
        this.error(
          'BANK_PERIOD_END_INVALID',
          'bank_statement.period_end',
          'La date de fin du relevé est absente ou invalide.',
        ),
      );
    }
    if (periodStart && periodEnd && periodStart > periodEnd) {
      issues.push(
        this.error(
          'BANK_PERIOD_INVALID',
          'bank_statement.period_end',
          'La période du relevé est inversée.',
        ),
      );
    }

    const opening = this.amount(statement.opening_balance);
    const closing = this.amount(statement.closing_balance);
    if (opening == null) {
      issues.push(
        this.error(
          'BANK_OPENING_BALANCE_MISSING',
          'bank_statement.opening_balance',
          'Le solde initial est absent ou illisible.',
        ),
      );
    }
    if (closing == null) {
      issues.push(
        this.error(
          'BANK_CLOSING_BALANCE_MISSING',
          'bank_statement.closing_balance',
          'Le solde final est absent ou illisible.',
        ),
      );
    }

    const rows = Array.isArray(statement.transactions)
      ? statement.transactions
      : [];
    if (!rows.length) {
      issues.push(
        this.error(
          'BANK_TRANSACTIONS_MISSING',
          'bank_statement.transactions',
          'Aucune opération bancaire n’a été détectée.',
        ),
      );
    }
    const normalizedRows = rows.map((row, index) => {
      const item = this.record(row) ?? {};
      const debit = this.amount(item.debit);
      const credit = this.amount(item.credit);
      const printedAmount = this.amount(item.amount);
      const amount =
        printedAmount ??
        (debit != null || credit != null ? (credit ?? 0) - (debit ?? 0) : null);
      const transactionDate = this.isoDate(item.transaction_date);
      const valueDate = this.isoDate(item.value_date);
      const description = this.text(item.description);
      if (!transactionDate) {
        issues.push(
          this.error(
            'BANK_TRANSACTION_DATE_INVALID',
            `bank_statement.transactions.${index}.transaction_date`,
            `La date de l’opération ${index + 1} est absente ou invalide.`,
          ),
        );
      }
      if (!description) {
        issues.push(
          this.error(
            'BANK_TRANSACTION_DESCRIPTION_MISSING',
            `bank_statement.transactions.${index}.description`,
            `Le libellé de l’opération ${index + 1} est absent.`,
          ),
        );
      }
      if (debit != null && credit != null && debit !== 0 && credit !== 0) {
        issues.push(
          this.error(
            'BANK_TRANSACTION_DIRECTION_AMBIGUOUS',
            `bank_statement.transactions.${index}`,
            `L’opération ${index + 1} contient simultanément un débit et un crédit.`,
          ),
        );
      }
      if (amount == null || Math.abs(amount) < 0.0005) {
        issues.push(
          this.error(
            'BANK_TRANSACTION_AMOUNT_INVALID',
            `bank_statement.transactions.${index}.amount`,
            `Le montant de l’opération ${index + 1} est absent ou nul.`,
          ),
        );
      }
      if (
        transactionDate &&
        periodStart &&
        periodEnd &&
        (transactionDate < periodStart || transactionDate > periodEnd)
      ) {
        issues.push(
          this.error(
            'BANK_TRANSACTION_OUTSIDE_PERIOD',
            `bank_statement.transactions.${index}.transaction_date`,
            `L’opération ${index + 1} est hors de la période du relevé.`,
          ),
        );
      }
      return {
        transaction_date: transactionDate,
        value_date: valueDate,
        description,
        reference: this.text(item.reference),
        debit,
        credit,
        amount,
        balance: this.amount(item.balance),
      };
    });

    if (opening != null && closing != null && normalizedRows.length) {
      const calculated = normalizedRows.reduce(
        (total, row) =>
          total + (typeof row.amount === 'number' ? row.amount : 0),
        opening,
      );
      const difference = Math.abs(calculated - closing);
      if (difference > 0.002) {
        issues.push(
          this.error(
            'BANK_CLOSING_BALANCE_MISMATCH',
            'bank_statement.closing_balance',
            `Le solde final diffère du solde initial augmenté des opérations de ${difference.toFixed(3)} TND.`,
          ),
        );
      }
    }

    normalizedData.bank_statement = {
      bank_name: this.text(statement.bank_name),
      iban: this.text(statement.iban),
      account_number: this.text(statement.account_number),
      period_start: periodStart,
      period_end: periodEnd,
      opening_balance: opening,
      closing_balance: closing,
      transactions: normalizedRows,
    };
    normalizedData.currency = this.text(input.currency) ?? 'TND';
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

  private isoDate(value: unknown) {
    const text = this.text(value);
    if (!text) return null;
    const candidate = text.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return null;
    const date = new Date(`${candidate}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== candidate
      ? null
      : candidate;
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

  private rate(value: unknown): number | null {
    const rate = this.amount(value);
    if (rate == null) return null;
    return rate > 1 ? rate / 100 : rate;
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
