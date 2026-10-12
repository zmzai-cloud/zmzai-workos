import { expect, it } from "vitest";
import { noteNavigationQuery } from "./domain/notes";
import { mergeNoteSummaries } from "./note-navigation";
it.each([{offset:-1},{offset:1.5},{limit:0},{limit:101},{q:"x".repeat(121)}])("rejects invalid navigation queries: %s", input => expect(noteNavigationQuery.safeParse(input).success).toBe(false));
it("normalizes bounded title searches and pagination", () => expect(noteNavigationQuery.parse({q:" 云朵 ", offset:"50",limit:"25"})).toEqual({q:"云朵",offset:50,limit:25}));
it("deduplicates overlapping pages while keeping edited rows in place", () => {
  const make = (id:string,title=id) => ({noteId:id,title,revision:1,updatedAt:"2026-10-12T00:00:00Z",sourceSessionId:null});
  expect(mergeNoteSummaries([make("a"),make("b")],[make("b","已编辑"),make("c")]).map(n=>[n.noteId,n.title])).toEqual([["a","a"],["b","已编辑"],["c","c"]]);
});
