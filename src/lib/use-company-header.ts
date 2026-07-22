import { useEffect, useState } from "react";
import { api, type CompanyProfile } from "@/lib/api";

/**
 * Company's legal identity line for the top of every print/export — legal name, CR number, VAT
 * number — mirroring the backend's ExportFileBuilder.FormatCompanyHeader exactly, so a client-built
 * CSV/print (Orders, Batches, HRM module lists, …) and a server-rendered report export always show
 * the same header instead of only the latter having it.
 */
export function formatCompanyHeader(company: CompanyProfile | null | undefined): string {
  if (!company) return "";
  const parts: string[] = [];
  if (company.legalName?.trim()) parts.push(company.legalName.trim());
  if (company.crNumber?.trim()) parts.push(`CR ${company.crNumber.trim()}`);
  if (company.vatNumber?.trim()) parts.push(`VAT ${company.vatNumber.trim()}`);
  return parts.join("  ·  ");
}

// Module-scoped cache: the company profile is tenant-wide and effectively static for a session, so
// every page that needs the export/print header shares one request instead of each refetching it.
let cachedProfile: Promise<CompanyProfile> | null = null;

export function useCompanyHeader(): string {
  const [header, setHeader] = useState("");
  useEffect(() => {
    if (!cachedProfile) cachedProfile = api.getCompanyProfile();
    let cancelled = false;
    cachedProfile.then((c) => { if (!cancelled) setHeader(formatCompanyHeader(c)); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return header;
}
