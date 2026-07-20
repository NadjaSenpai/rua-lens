export function DomainFilter({ domains, value }: { domains: readonly string[]; value: string }) {
  const options = value && !domains.includes(value) ? [value, ...domains] : domains;
  return (
    <label>
      <span>対象ドメイン</span>
      <select name="domain" defaultValue={value}>
        <option value="">すべてのドメイン</option>
        {options.map((domain) => <option key={domain} value={domain}>{domain}</option>)}
      </select>
    </label>
  );
}
