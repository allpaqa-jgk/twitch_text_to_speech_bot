import { csvList, type ListType } from "../../storage/csvList";
import { config } from "../../config";

export interface CommandResult {
  replyMessage: string;
}

/** Escape special RegExp characters in a user-supplied string */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function handleRememberCommand(msg: string): CommandResult {
  const isUser = new RegExp(
    `^!(${escapeRegExp(config.COMMENT_REMEMVER_COMMAND)}U)`
  ).test(msg);
  const listType: ListType = isUser ? "usernameConvertList" : "messageConvertList";

  const match = msg.match(/^!([^\s]+)\s+([^=]+)=(.+)$/);
  if (!match) {
    return {
      replyMessage: `Format error! Use: "!${config.COMMENT_REMEMVER_COMMAND}${isUser ? "U" : ""} <keyword>=<how_to_read>"`,
    };
  }

  const keyword = match[2].trim();
  const read = match[3].trim();

  // Security: prevent ReDoS and memory abuse
  if (keyword.length > 100) {
    return { replyMessage: "Error: Keyword too long (max 100 chars)" };
  }
  if (read.length > 200) {
    return { replyMessage: "Error: Replacement text too long (max 200 chars)" };
  }

  // Escape regex special characters so user-supplied keyword is treated as literal string
  const safeKeyword = escapeRegExp(keyword);

  const list = csvList.readList(listType);
  const index = list.findIndex((row) => row[0] === safeKeyword || row[0] === keyword);

  if (index >= 0) {
    const oldRead = list[index][1];
    list[index] = [safeKeyword, read];
    csvList.writeList(listType, list);

    if (oldRead === read) {
      return { replyMessage: `${keyword} is not changed` };
    } else {
      return { replyMessage: `${keyword} is updated (${oldRead} => ${read})` };
    }
  } else {
    list.push([safeKeyword, read]);
    csvList.writeList(listType, list);
    return { replyMessage: `${keyword} is added (=${read})` };
  }
}

export function handleForgetCommand(msg: string): CommandResult {
  const isUser = new RegExp(
    `^!(${escapeRegExp(config.COMMENT_FORGET_COMMAND)}U)`
  ).test(msg);
  const listType: ListType = isUser ? "usernameConvertList" : "messageConvertList";

  const match = msg.match(/^!([^\s]+)\s+(.+)$/);
  if (!match) {
    return {
      replyMessage: `Format error! Use: "!${config.COMMENT_FORGET_COMMAND}${isUser ? "U" : ""} <keyword>"`,
    };
  }

  const keyword = match[2].trim();
  const safeKeyword = escapeRegExp(keyword);
  const list = csvList.readList(listType);
  const index = list.findIndex((row) => row[0] === safeKeyword || row[0] === keyword);

  if (index >= 0) {
    const oldRead = list[index][1];
    list.splice(index, 1);
    csvList.writeList(listType, list);
    return { replyMessage: `${keyword}=${oldRead} is forgotten` };
  } else {
    return { replyMessage: `${keyword} is not found` };
  }
}
