import { cosmos } from "@graphprotocol/graph-ts";
import { Event } from "../generated/schema";

function messageId(data: cosmos.Header): string {
  return `${data.hash.toHexString()}-${data.height.toString()}`;
}

export function handleEvent(data: cosmos.EventData): void {
  let event = new Event(messageId(data.block.header));
  event.type = data.event.eventType;
  event.transaction = data.block.header.hash.toHexString();
  event.block = data.block.header.height.toString();
  
  event.contract_address = data.event.getAttributeValue("_contract_address");
  event.action = data.event.getAttributeValue("action");

  event.save();
}
