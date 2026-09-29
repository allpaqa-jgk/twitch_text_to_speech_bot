import type {
  DictionaryKind,
  DictionaryRepository,
} from "../application/dictionaryService";
import { csvList, type ListType } from "./csvList";

const LIST_TYPES: Record<DictionaryKind, ListType> = {
  message: "messageConvertList",
  username: "usernameConvertList",
  ignore: "messageIgnoreList",
};

export class CsvDictionaryRepository implements DictionaryRepository {
  public read(kind: DictionaryKind): string[][] {
    return csvList.readList(LIST_TYPES[kind]);
  }

  public write(kind: DictionaryKind, rows: string[][]): void {
    csvList.writeList(LIST_TYPES[kind], rows);
  }
}
