using System.Globalization;
using System.Reflection;
using System.Xml;

namespace BaqalaPOS.Api.Services;

public record ZatcaPartyAddress(
    string? Street,
    string? BuildingNumber,
    string? CitySubdivision,
    string? City,
    string? PostalZone);

public record ZatcaParty(
    string? RegistrationName,
    string? VatId,
    ZatcaPartyAddress? Address,
    string? PartyIdentificationSchemeId = null,
    string? PartyIdentificationId = null);

public record ZatcaInvoiceLineItem(string Name, decimal Quantity, decimal Price, decimal VatPercent);

public record ZatcaInvoiceData(
    string Id,
    string Uuid,
    string IssueDate,
    string IssueTime,
    string InvoiceTypeCode,   // 388 | 381 | 383
    string Subtype,           // 0100000 (standard) | 0200000 (simplified)
    int Icv,
    string Pih,
    ZatcaParty Supplier,
    ZatcaParty? Customer,
    IReadOnlyList<ZatcaInvoiceLineItem> Items,
    decimal DiscountAmount = 0,
    string Currency = "SAR",
    string PaymentMeansCode = "10",
    string? Note = null,
    string NoteLanguage = "ar",
    string? InstructionNote = null,   // KSA-10, required for credit/debit notes
    string? BillingReference = null); // KSA-16, original invoice reference for credit/debit notes

// Ports InvoiceHelper.php (ModifyXml / UpdateInvoiceFromData): fills the base UBL 2.1
// Invoice.xml template with per-transaction data. Namespaces/structure must stay byte-compatible
// with the template since EInvoiceSigner/QRCodeGenerator query it by exact XPath afterwards.
public class ZatcaInvoiceXmlBuilder
{
    private const string NsCbc = "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2";
    private const string NsCac = "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2";

    public XmlDocument Build(ZatcaInvoiceData data)
    {
        var doc = LoadTemplate();
        var ns = CreateNamespaceManager(doc);

        SetNodeValue(doc, ns, "//cbc:ID", data.Id);
        SetNodeValue(doc, ns, "//cbc:UUID", data.Uuid);
        SetNodeValue(doc, ns, "//cbc:IssueDate", data.IssueDate);
        SetNodeValue(doc, ns, "//cbc:IssueTime", data.IssueTime);
        SetNodeValue(doc, ns, "//cbc:DocumentCurrencyCode", data.Currency);
        SetNodeValue(doc, ns, "//cbc:TaxCurrencyCode", data.Currency);
        SetNodeValue(doc, ns, "//cac:PaymentMeans/cbc:PaymentMeansCode", data.PaymentMeansCode);

        var invoiceTypeCodeNode = doc.SelectSingleNode("//cbc:InvoiceTypeCode", ns);
        if (invoiceTypeCodeNode is XmlElement invoiceTypeCodeEl)
        {
            invoiceTypeCodeEl.InnerText = data.InvoiceTypeCode;
            invoiceTypeCodeEl.SetAttribute("name", data.Subtype);
        }

        if (data.Note is not null)
        {
            var noteNode = doc.SelectSingleNode("//cbc:Note", ns) as XmlElement;
            if (noteNode is not null)
            {
                noteNode.InnerText = data.Note;
                noteNode.SetAttribute("languageID", data.NoteLanguage);
            }
        }

        SetNodeValue(doc, ns, "//cac:AdditionalDocumentReference[cbc:ID='ICV']/cbc:UUID", data.Icv.ToString(CultureInfo.InvariantCulture));
        SetNodeValue(doc, ns, "//cac:AdditionalDocumentReference[cbc:ID='PIH']/cac:Attachment/cbc:EmbeddedDocumentBinaryObject", data.Pih);

        // KSA-10 (credit/debit note reason) vs KSA-16 (billing reference) are mutually present:
        // notes require a reference back to the original invoice; plain invoices carry neither.
        if (!string.IsNullOrEmpty(data.InstructionNote))
        {
            var paymentMeansNode = doc.SelectSingleNode("//cac:PaymentMeans", ns);
            if (paymentMeansNode is not null)
            {
                var instructionNoteEl = doc.CreateElement("cbc", "InstructionNote", NsCbc);
                instructionNoteEl.InnerText = data.InstructionNote;
                paymentMeansNode.AppendChild(instructionNoteEl);
            }

            if (!string.IsNullOrEmpty(data.BillingReference))
            {
                SetNodeValue(doc, ns, "//cac:BillingReference/cac:InvoiceDocumentReference/cbc:ID", data.BillingReference);
            }
        }
        else
        {
            foreach (XmlNode node in doc.SelectNodes("//cac:BillingReference", ns)!)
            {
                node.ParentNode?.RemoveChild(node);
            }
        }

        UpdateParty(doc, ns, "AccountingSupplierParty", data.Supplier);
        if (data.Customer is not null)
        {
            UpdateParty(doc, ns, "AccountingCustomerParty", data.Customer);
        }

        UpdateLineItems(doc, ns, data.Items, data.DiscountAmount);

        return doc;
    }

    // Mirrors InvoiceHelper::ModifyXml — used only for the 6 fixed ZATCA compliance-check
    // documents, which reuse the template's baked-in sample supplier/customer/items and only
    // vary id/type/counter/reason, unlike Build() which populates real transaction data.
    public XmlDocument ModifyForComplianceTest(string id, string subtype, string invoiceTypeCode, int icv, string pih, string? instructionNote)
    {
        var doc = LoadTemplate();
        var ns = CreateNamespaceManager(doc);

        SetNodeValue(doc, ns, "//cbc:ID", id);
        SetNodeValue(doc, ns, "//cbc:UUID", Guid.NewGuid().ToString());

        var invoiceTypeCodeNode = doc.SelectSingleNode("//cbc:InvoiceTypeCode", ns) as XmlElement;
        if (invoiceTypeCodeNode is not null)
        {
            invoiceTypeCodeNode.InnerText = invoiceTypeCode;
            invoiceTypeCodeNode.SetAttribute("name", subtype);
        }

        SetNodeValue(doc, ns, "//cac:AdditionalDocumentReference[cbc:ID='ICV']/cbc:UUID", icv.ToString(CultureInfo.InvariantCulture));
        SetNodeValue(doc, ns, "//cac:AdditionalDocumentReference[cbc:ID='PIH']/cac:Attachment/cbc:EmbeddedDocumentBinaryObject", pih);

        if (!string.IsNullOrEmpty(instructionNote))
        {
            var paymentMeansNode = doc.SelectSingleNode("//cac:PaymentMeans", ns);
            if (paymentMeansNode is not null)
            {
                var instructionNoteEl = doc.CreateElement("cbc", "InstructionNote", NsCbc);
                instructionNoteEl.InnerText = instructionNote;
                paymentMeansNode.AppendChild(instructionNoteEl);
            }
        }
        else
        {
            foreach (XmlNode node in doc.SelectNodes("//cac:BillingReference", ns)!)
            {
                node.ParentNode?.RemoveChild(node);
            }
        }

        return doc;
    }

    private static XmlDocument LoadTemplate()
    {
        var assembly = Assembly.GetExecutingAssembly();
        using var stream = assembly.GetManifestResourceStream("BaqalaPOS.Api.Zatca.Templates.Invoice.xml")
            ?? throw new InvalidOperationException("Embedded resource Zatca.Templates.Invoice.xml not found.");
        var doc = new XmlDocument { PreserveWhitespace = true };
        doc.Load(stream);
        return doc;
    }

    private static XmlNamespaceManager CreateNamespaceManager(XmlDocument doc)
    {
        var ns = new XmlNamespaceManager(doc.NameTable);
        ns.AddNamespace("cbc", NsCbc);
        ns.AddNamespace("cac", NsCac);
        return ns;
    }

    private static void SetNodeValue(XmlDocument doc, XmlNamespaceManager ns, string xpath, string value)
    {
        var node = doc.SelectSingleNode(xpath, ns);
        if (node is not null) node.InnerText = value;
    }

    private static void UpdateParty(XmlDocument doc, XmlNamespaceManager ns, string partyType, ZatcaParty party)
    {
        var baseXPath = $"//cac:{partyType}/cac:Party";

        if (party.PartyIdentificationId is not null)
        {
            var idNode = doc.SelectSingleNode($"{baseXPath}/cac:PartyIdentification/cbc:ID", ns) as XmlElement;
            if (idNode is not null)
            {
                idNode.InnerText = party.PartyIdentificationId;
                if (party.PartyIdentificationSchemeId is not null)
                    idNode.SetAttribute("schemeID", party.PartyIdentificationSchemeId);
            }
        }

        if (party.Address is { } addr)
        {
            if (addr.Street is not null) SetNodeValue(doc, ns, $"{baseXPath}/cac:PostalAddress/cbc:StreetName", addr.Street);
            if (addr.BuildingNumber is not null) SetNodeValue(doc, ns, $"{baseXPath}/cac:PostalAddress/cbc:BuildingNumber", addr.BuildingNumber);
            if (addr.CitySubdivision is not null) SetNodeValue(doc, ns, $"{baseXPath}/cac:PostalAddress/cbc:CitySubdivisionName", addr.CitySubdivision);
            if (addr.City is not null) SetNodeValue(doc, ns, $"{baseXPath}/cac:PostalAddress/cbc:CityName", addr.City);
            if (addr.PostalZone is not null) SetNodeValue(doc, ns, $"{baseXPath}/cac:PostalAddress/cbc:PostalZone", addr.PostalZone);
        }

        if (party.RegistrationName is not null)
            SetNodeValue(doc, ns, $"{baseXPath}/cac:PartyLegalEntity/cbc:RegistrationName", party.RegistrationName);
        if (party.VatId is not null)
            SetNodeValue(doc, ns, $"{baseXPath}/cac:PartyTaxScheme/cbc:CompanyID", party.VatId);
    }

    private static void UpdateLineItems(XmlDocument doc, XmlNamespaceManager ns, IReadOnlyList<ZatcaInvoiceLineItem> items, decimal discountAmount)
    {
        var templateLine = doc.SelectSingleNode("//cac:InvoiceLine", ns)
            ?? throw new InvalidOperationException("No InvoiceLine found in template to clone.");
        var lineTemplate = templateLine.CloneNode(true);

        foreach (XmlNode line in doc.SelectNodes("//cac:InvoiceLine", ns)!)
        {
            line.ParentNode?.RemoveChild(line);
        }

        var legalMonetaryTotal = doc.SelectSingleNode("//cac:LegalMonetaryTotal", ns);
        var insertionParent = legalMonetaryTotal?.ParentNode ?? doc.DocumentElement!;

        // Per-line amounts are gross (undiscounted) — the order-level discount, if any, is
        // applied only once via the document-level AllowanceCharge/LegalMonetaryTotal below
        // (matching the template's existing per-line AllowanceCharge/Amount, which stays 0.00
        // since this system never allocates discount per line).
        decimal totalExtensionAmount = 0;
        var vatPercent = items.Count > 0 ? items[0].VatPercent : 15m;

        for (var index = 0; index < items.Count; index++)
        {
            var item = items[index];
            var lineExtAmount = item.Quantity * item.Price;
            var taxAmount = lineExtAmount * (item.VatPercent / 100m);
            var lineTotal = lineExtAmount + taxAmount;

            totalExtensionAmount += lineExtAmount;

            var newLine = (XmlElement)lineTemplate.CloneNode(true);

            SetFirstDescendant(newLine, "ID", (index + 1).ToString(CultureInfo.InvariantCulture));
            SetFirstDescendant(newLine, "InvoicedQuantity", FormatDecimal(item.Quantity, 6));
            SetFirstDescendant(newLine, "LineExtensionAmount", FormatDecimal(lineExtAmount, 2));

            var taxTotalNode = newLine.GetElementsByTagName("TaxTotal", "*").Item(0) as XmlElement;
            if (taxTotalNode is not null)
            {
                SetFirstDescendant(taxTotalNode, "TaxAmount", FormatDecimal(taxAmount, 2));
                SetFirstDescendant(taxTotalNode, "RoundingAmount", FormatDecimal(lineTotal, 2));
            }

            var itemNode = newLine.GetElementsByTagName("Item", "*").Item(0) as XmlElement;
            if (itemNode is not null)
            {
                SetFirstDescendant(itemNode, "Name", item.Name);
                var taxCategory = itemNode.GetElementsByTagName("ClassifiedTaxCategory", "*").Item(0) as XmlElement;
                if (taxCategory is not null) SetFirstDescendant(taxCategory, "Percent", FormatDecimal(item.VatPercent, 2));
            }

            var priceNode = newLine.GetElementsByTagName("Price", "*").Item(0) as XmlElement;
            if (priceNode is not null) SetFirstDescendant(priceNode, "PriceAmount", FormatDecimal(item.Price, 2));

            insertionParent.AppendChild(newLine);
        }

        // Tax is computed on the taxable amount AFTER discount (matches how the POS receipt
        // itself computes VAT: (subtotal - discount) * rate).
        var taxableAmount = totalExtensionAmount - discountAmount;
        var totalTaxAmount = taxableAmount * (vatPercent / 100m);

        var allowanceCharge = doc.SelectSingleNode("/*/cac:AllowanceCharge", ns) as XmlElement;
        if (allowanceCharge is not null)
        {
            var amountNode = allowanceCharge.GetElementsByTagName("Amount", "*").Item(0);
            if (amountNode is not null) amountNode.InnerText = FormatDecimal(discountAmount, 2);
            foreach (XmlElement taxCategory in allowanceCharge.GetElementsByTagName("TaxCategory", "*"))
            {
                SetFirstDescendant(taxCategory, "Percent", FormatDecimal(vatPercent, 2));
            }
        }

        foreach (XmlNode taxTotal in doc.SelectNodes("/*/cac:TaxTotal", ns)!)
        {
            var taxTotalEl = (XmlElement)taxTotal;
            var taxAmountNode = taxTotalEl.GetElementsByTagName("TaxAmount", "*").Item(0);
            if (taxAmountNode is not null) taxAmountNode.InnerText = FormatDecimal(totalTaxAmount, 2);

            var subTotal = taxTotalEl.GetElementsByTagName("TaxSubtotal", "*").Item(0) as XmlElement;
            if (subTotal is not null)
            {
                subTotal.GetElementsByTagName("TaxableAmount", "*").Item(0)!.InnerText = FormatDecimal(taxableAmount, 2);
                subTotal.GetElementsByTagName("TaxAmount", "*").Item(0)!.InnerText = FormatDecimal(totalTaxAmount, 2);
                var taxCategory = subTotal.GetElementsByTagName("TaxCategory", "*").Item(0) as XmlElement;
                if (taxCategory is not null) SetFirstDescendant(taxCategory, "Percent", FormatDecimal(vatPercent, 2));
            }
        }

        if (legalMonetaryTotal is not null)
        {
            var totalPayable = taxableAmount + totalTaxAmount;
            SetFirstDescendant((XmlElement)legalMonetaryTotal, "LineExtensionAmount", FormatDecimal(totalExtensionAmount, 2));
            SetFirstDescendant((XmlElement)legalMonetaryTotal, "TaxExclusiveAmount", FormatDecimal(taxableAmount, 2));
            SetFirstDescendant((XmlElement)legalMonetaryTotal, "TaxInclusiveAmount", FormatDecimal(totalPayable, 2));
            SetFirstDescendant((XmlElement)legalMonetaryTotal, "AllowanceTotalAmount", FormatDecimal(discountAmount, 2));
            SetFirstDescendant((XmlElement)legalMonetaryTotal, "PayableAmount", FormatDecimal(totalPayable, 2));
        }
    }

    private static void SetFirstDescendant(XmlElement parent, string tagName, string value)
    {
        var node = parent.GetElementsByTagName(tagName, "*").Item(0);
        if (node is not null) node.InnerText = value;
    }

    private static string FormatDecimal(decimal value, int decimals) =>
        Math.Round(value, decimals, MidpointRounding.AwayFromZero).ToString("F" + decimals, CultureInfo.InvariantCulture);
}
