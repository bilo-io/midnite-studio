/** Captured shape of one GraphQL history page (messages carry trailers; one node has no oid). */
export const historyFixture = {
  "repository": {
    "ref": {
      "target": {
        "history": {
          "pageInfo": { "hasNextPage": true, "endCursor": "abc 1" },
          "nodes": [
            {
              "oid": "a1",
              "message": "feat: add thing\n\nbody\n\nCo-Authored-By: Ada <ada@example.com>\nmidnite-session: sess-9\n",
              "messageHeadline": "feat: add thing",
              "authoredDate": "2026-11-18T10:00:00Z",
              "committedDate": "2026-11-18T10:05:00Z",
              "author": { "name": "Bilo", "email": "b@example.com" },
              "parents": { "nodes": [{ "oid": "b2" }, { "oid": "c3" }] }
            },
            { "message": "no oid, dropped" },
            { "oid": "b2", "message": "root", "authoredDate": "bogus", "author": null, "parents": { "nodes": [] } }
          ]
        }
      }
    }
  }
};
