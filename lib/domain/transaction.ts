import mongoose, { type ClientSession } from "mongoose";
import { connectMongo } from "@/lib/database/mongodb";
import { NoteModel } from "@/models/note";
import { TodoModel } from "@/models/todo";
import { DomainActionModel } from "@/models/domain-action";

/** Replica-set transactions are required; failing closed protects against partial writes. */
export async function domainTransaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
  await connectMongo();
  await Promise.all([NoteModel.init(), TodoModel.init(), DomainActionModel.init()]);
  return mongoose.connection.transaction(work, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
}
