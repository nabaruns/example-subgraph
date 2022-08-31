import { cosmos, log, BigInt } from "@graphprotocol/graph-ts";
import { Event, Market } from "../generated/schema";
import { DAYS_PER_YEAR, PROTOCOL_ADDRESS, PRICE_ORACLE1_ADDRESS, pTokenAddrMap } from "./constants";
import {  getOrCreateProtocol, _handleMint, _handleMarketListed, eventActionId, snapshotMarket, snapshotFinancials, updateProtocol, updateMarket, getOrCreateCircularBuffer, _handleOracleFeed, _handleBorrow, _handleRepayBorrow, _handleRedeem, eventInterestId } from "./actions";

export function handleEvent(data: cosmos.EventData): void {
  if (data.event.attributes[0].key == "_contract_address") {
    if (data.event.attributes[1].key == "action") {
      let contract_address = data.event.attributes[0].value;
      let action = data.event.attributes[1].value;
      let asset = "";
      let amount = "";

      if (contract_address == PROTOCOL_ADDRESS && action == "init_asset") {
        let protocol = getOrCreateProtocol();
        _handleMarketListed(protocol, data);
      }
      else if (contract_address == PRICE_ORACLE1_ADDRESS && action == "feed_prices") {
        // Iterate over multiple asset feed prices
        for (let i = 0; i < data.event.attributes.length; i++) {
          if (data.event.attributes[i].key == "asset") {
            _handleOracleFeed(data, i);
            asset = data.event.attributes[i].value;
            amount = data.event.attributes[i+1].value;
          }
        }
      }
      else if (action == "mint") {
        // This event happens at the pToken contract
        _handleMint(data);
        amount = data.event.getAttributeValue("amount");
        asset = data.event.getAttributeValue("_contract_address");
      }
      else if (contract_address == PROTOCOL_ADDRESS && action == "withdraw") {
        // This event happens at the BL contract
        _handleRedeem(data);
        let asset = data.event.getAttributeValue("asset");
        asset = pTokenAddrMap.get(asset);
        amount = data.event.getAttributeValue("burn_amount");
      }
      else if (contract_address == PROTOCOL_ADDRESS && action == "borrow") {
        // This event happens at the BL contract
        _handleBorrow(data);
      }
      else if (contract_address == PROTOCOL_ADDRESS && action == "repay") {
        // This event happens at the BL contract
        _handleRepayBorrow(data);
      } else {
        return;
      }

      let event = new Event(eventActionId(data));
      event.event_type = data.event.eventType;
      event.block_hash = data.block.header.hash.toHexString();
      event.block_height = data.block.header.height.toString();
      event.block_time = data.block.header.time.seconds.toString();
      event.contract_address = contract_address;
      event.action = action;
      event.asset = asset;
      event.amount = amount;
      event.save();
    }
  }
}

export function handleAccrueInterest(data: cosmos.EventData): void {
  const contract_address = data.event.getAttributeValue("_contract_address");
  if (contract_address == PROTOCOL_ADDRESS) {
    let event = new Event(eventInterestId(data));
    event.event_type = data.event.eventType;
    event.block_hash = data.block.header.hash.toHexString();
    event.block_height = data.block.header.height.toString();
    event.block_time = data.block.header.time.seconds.toString();
    event.contract_address = contract_address;
    event.action = data.event.getAttributeValue("asset");
    event.save();

    let asset = data.event.getAttributeValue("asset");
    let marketID = pTokenAddrMap.get(asset);
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
      PROTOCOL_ADDRESS,
      blocksPerDay * DAYS_PER_YEAR
    );
    updateProtocol(PROTOCOL_ADDRESS);

    snapshotFinancials(
      PROTOCOL_ADDRESS,
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
