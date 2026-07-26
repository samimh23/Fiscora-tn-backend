import { createHash } from 'node:crypto';
import type { BusinessInvoice, ClientDossier } from '../database/entities';

export function escapeXml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildNeutralTtnPayload(
  dossier: ClientDossier,
  invoice: BusinessInvoice,
  schemaVersion: string,
) {
  const lines = invoice.lines
    .map(
      (line, index) => `
      <Line number="${index + 1}">
        <Description>${escapeXml(line.description)}</Description>
        <Quantity>${line.quantity}</Quantity>
        <UnitPrice currency="TND">${line.unitPrice}</UnitPrice>
        <NetAmount currency="TND">${line.netAmount}</NetAmount>
        <VatRate>${line.vatRate}</VatRate>
        <VatAmount currency="TND">${line.vatAmount}</VatAmount>
      </Line>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<ElectronicInvoiceEnvelope xmlns="urn:compta-tn:ttn-adapter" schemaVersion="${escapeXml(schemaVersion)}">
  <Mode>ADAPTATEUR_INTERNE_NON_OFFICIEL</Mode>
  <Issuer>
    <LegalName>${escapeXml(dossier.legalName)}</LegalName>
    <TaxIdentifier>${escapeXml(dossier.taxIdentifier)}</TaxIdentifier>
  </Issuer>
  <Recipient>
    <Name>${escapeXml(invoice.thirdPartyName)}</Name>
    <TaxIdentifier>${escapeXml(invoice.thirdPartyTaxIdentifier)}</TaxIdentifier>
    <Address>${escapeXml(invoice.thirdParty?.address)}</Address>
  </Recipient>
  <Invoice>
    <Number>${escapeXml(invoice.number)}</Number>
    <Date>${invoice.invoiceDate}</Date>
    <Kind>${invoice.kind}</Kind>
    <Currency>TND</Currency>
    <Lines>${lines}
    </Lines>
    <Totals>
      <Net>${invoice.netAmount}</Net>
      <Vat>${invoice.vatAmount}</Vat>
      <StampDuty>${invoice.stampDuty}</StampDuty>
      <Gross>${invoice.grossAmount}</Gross>
      <Withholding>${invoice.withholdingAmount}</Withholding>
      <NetPayable>${invoice.netPayable}</NetPayable>
    </Totals>
  </Invoice>
</ElectronicInvoiceEnvelope>`;
}

export function sha256(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
