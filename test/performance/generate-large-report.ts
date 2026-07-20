const encoder = new TextEncoder();

export function generateDenseReport(totalBytes: number, reportId: string, recordCount: number): string {
  if (!Number.isSafeInteger(recordCount) || recordCount < 1) {
    throw new Error("recordCount must be a positive safe integer");
  }
  const prefix = `<?xml version="1.0" encoding="UTF-8"?>
<feedback>
  <report_metadata>
    <org_name>Dense Performance Fixture</org_name>
    <report_id>${reportId}</report_id>
    <date_range><begin>1700000000</begin><end>1700086400</end></date_range>
  </report_metadata>
  <policy_published><domain>example.com</domain><p>reject</p></policy_published>
`;
  let records = "";
  for (let index = 0; index < recordCount; index += 1) {
    records += `<record>
  <row>
    <source_ip>192.0.2.${(index % 254) + 1}</source_ip><count>1</count>
    <policy_evaluated>
      <disposition>none</disposition><dkim>pass</dkim><spf>pass</spf>
      <reason><type>local_policy</type><comment>dense-${index}</comment></reason>
    </policy_evaluated>
  </row>
  <identifiers><header_from>example.com</header_from><envelope_to>recipient-${index}@example.com</envelope_to></identifiers>
  <auth_results>
    <dkim><domain>example.com</domain><selector>dense-${index}</selector><result>pass</result></dkim>
    <spf><domain>example.com</domain><scope>mfrom</scope><result>pass</result></spf>
  </auth_results>
</record>
`;
  }
  const suffix = "</feedback>";
  const minimumBytes = encoder.encode(prefix + records + suffix).byteLength;
  if (!Number.isSafeInteger(totalBytes) || totalBytes < minimumBytes) {
    throw new Error("totalBytes is too small for the requested dense report");
  }
  return `${prefix}${records}${" ".repeat(totalBytes - minimumBytes)}${suffix}`;
}

export function generateLargeReport(totalBytes: number, reportId: string): string {
  const prefix = `<?xml version="1.0" encoding="UTF-8"?>
<feedback>
  <report_metadata>
    <org_name>Performance Fixture</org_name>
    <report_id>${reportId}</report_id>
    <date_range><begin>1700000000</begin><end>1700086400</end></date_range>
  </report_metadata>
  <policy_published><domain>example.com</domain><p>reject</p></policy_published>
  <record>
    <row>
      <source_ip>192.0.2.10</source_ip><count>1</count>
      <policy_evaluated><disposition>none</disposition><dkim>pass</dkim><spf>fail</spf></policy_evaluated>
    </row>
    <identifiers><header_from>example.com</header_from></identifiers>
    <auth_results><dkim><domain>example.com</domain><selector>performance</selector><result>pass</result></dkim></auth_results>
  </record>
`;
  const suffix = "</feedback>";
  const minimumBytes = encoder.encode(prefix + suffix).byteLength;
  if (!Number.isSafeInteger(totalBytes) || totalBytes < minimumBytes) {
    throw new Error("totalBytes is too small for a valid report");
  }
  return `${prefix}${" ".repeat(totalBytes - minimumBytes)}${suffix}`;
}
