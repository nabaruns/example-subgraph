import { cosmos, log, BigInt } from "@graphprotocol/graph-ts";
import { Event, Market } from "../generated/schema";
import { DAYS_PER_YEAR, MARKET_ADDRESS, PRICE_ORACLE1_ADDRESS } from "./constants";
import {  getOrCreateProtocol, _handleMint, _handleMarketListed, eventId, snapshotMarket, snapshotFinancials, updateProtocol, updateMarket, getOrCreateCircularBuffer, _handleOracleFeed } from "./actions";

export function handleEvent(data: cosmos.EventData): void {
  if (data.event.attributes[0].key == "_contract_address" &&
    data.event.attributes[0].value == MARKET_ADDRESS || 
    data.event.attributes[0].value == PRICE_ORACLE1_ADDRESS) {

    let event = new Event(eventId(data));
    event.event_type = data.event.eventType;
    event.block_hash = data.block.header.hash.toHexString();
    event.block_height = data.block.header.height.toString();
    event.block_time = data.block.header.time.seconds.toString();
    event.contract_address = data.event.attributes[0].value;

    if (data.event.attributes[1].key == "action") {
      event.action = data.event.attributes[1].value;
      if (event.action == "init_asset") {
        let protocol = getOrCreateProtocol();
        _handleMarketListed(protocol, data);
      }
      else if (event.action == "feed_prices") {
        for (let i = 0; i < data.event.attributes.length; i++) {
          if (data.event.attributes[i].key == "asset") {
            _handleOracleFeed(data, i);
          }
        }
      }
      else if (event.action == "deposit") {
        _handleMint(data);
      }
    }
    event.save();
  }
}

export function handleAccrueInterest(data: cosmos.EventData): void {
  const contract_address = data.event.getAttributeValue("_contract_address");
  if (contract_address == MARKET_ADDRESS) {
    log.info("[{}] {}",[data.event.eventType, data.event.getAttributeValue("asset")]);

    let event = new Event(eventId(data));
    event.event_type = data.event.eventType;
    event.block_hash = data.block.header.hash.toHexString();
    event.block_height = data.block.header.height.toString();
    event.block_time = data.block.header.time.seconds.toString();
    event.contract_address = contract_address;
    event.action = data.event.getAttributeValue("asset");
    event.save();

    let marketID = data.event.getAttributeValue("asset");
    let market = Market.load(marketID);
    if (!market) {
      log.warning("[handleAccrueInterest] Market not found: {}", [marketID]);
      return;
    }

    const timestamp = BigInt.fromString(data.block.header.time.seconds.toString());
    const blockNumber = BigInt.fromU64(data.block.header.height);

    let blocksPerDay = BigInt.fromString(
      getOrCreateCircularBuffer().blocksPerDay.truncate(0).toString()
    ).toI32();
    
    // creates and initializes market snapshots
    snapshotMarket(
      marketID,
      blockNumber,
      timestamp
    );

    updateMarket(
      marketID,
      data.event,
      blockNumber,
      timestamp,
      false,
      MARKET_ADDRESS,
      blocksPerDay * DAYS_PER_YEAR
    );
    updateProtocol(MARKET_ADDRESS);

    snapshotFinancials(
      MARKET_ADDRESS,
      blockNumber,
      timestamp,
    );
  }
}

// export function handleTx(data: cosmos.TransactionData): void {
//   const id = `${data.block.header.hash.toHexString()}-${data.tx.index}`;
//   const messages = data.tx.tx.body.messages;

//   for (let i = 0; i < messages.length; i++) {
//     let msgType = messages[i].typeUrl;
//     if (msgType == "/cosmwasm.wasm.v1.MsgExecuteContract") {
//       let msgValue = messages[i].value as Uint8Array;
//       createTx(id, decodeMsgExecuteContract(msgValue), data.tx.hash);
//     }
//   }
// }

// function createTx(id: string, message: MsgExecuteContract, hash: Bytes): void {
//   const tx = new Tx(id);
//   tx.message = message.msg;
//   tx.sender = message.sender;
//   tx.contract =  message.contract;
//   tx.contract =  message.contract;
//   tx.hash =  hash.toHexString();
//   tx.save();
// }
