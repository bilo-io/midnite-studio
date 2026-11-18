/**
 * A GraphQL request, transport-agnostic: the document plus its variables. Mobile POSTs it as JSON to
 * `https://api.github.com/graphql`; nothing here knows about `fetch` or `gh`. Values travel as variables,
 * never spliced into the document, so a repo named `2048` or a ref with a quote cannot break the query.
 */
export interface GraphqlRequest {
  query: string;
  variables: Record<string, unknown>;
}
