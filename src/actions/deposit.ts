import { cosmos, log, BigInt } from "@graphprotocol/graph-ts";
import { eventActionId, snapshotFinancials, snapshotMarket, snapshotUsage, updateAllMarketPrices, updateMarketSnapshots, updateProtocol } from ".";
import { Deposit, LendingProtocol, Market, Token } from "../../generated/schema";
import { EventType, exponentToBigDecimal, PROTOCOL_ADDRESS } from "../constants";

export function _handleMint(data: cosmos.EventData): void {
  let event = data.event;
  const mintAmount = BigInt.fromString(event.getAttributeValue("amount"));
  const minter = event.getAttributeValue("to");

  let protocol = LendingProtocol.load(PROTOCOL_ADDRESS);
  if (!protocol) {
    log.warning("[handleMint] protocol not found: {}", [
      PROTOCOL_ADDRESS,
    ]);
    return;
  }
  let marketID = data.event.getAttributeValue("_contract_address");
  let market = Market.load(marketID);
  if (!market) {
    log.warning("[handleMint] Market not found: {}", [marketID]);
    return;
  }
  let underlyingToken = Token.load(market.inputToken);
  if (!underlyingToken) {
    log.warning("[handleMint] Failed to load underlying token: {}", [
      market.inputToken,
    ]);
    return;
  }

  let depositID = eventActionId(data);
  let deposit = new Deposit(depositID);
  deposit.hash = data.block.header.hash.toHexString();
  deposit.logIndex = BigInt.fromU64(data.block.header.height);
  deposit.protocol = protocol.id;
  deposit.to = marketID;
  deposit.from = minter;
  deposit.blockNumber = BigInt.fromU64(data.block.header.height);
  deposit.timestamp = BigInt.fromString(data.block.header.time.seconds.toString());
  deposit.market = marketID;
  deposit.asset = market.inputToken;
  deposit.amount = mintAmount;
  let depositUSD = market.inputTokenPriceUSD.times(
    mintAmount
      .toBigDecimal()
      .div(exponentToBigDecimal(underlyingToken.decimals))
  );
  deposit.amountUSD = depositUSD;
  deposit.save();

  market.outputTokenSupply = market.outputTokenSupply.plus(mintAmount);
  market.cumulativeDepositUSD = market.cumulativeDepositUSD.plus(depositUSD);
  market.save();

  const timestamp = BigInt.fromString(data.block.header.time.seconds.toString());
  const blockNumber = BigInt.fromU64(data.block.header.height);
  
  // creates and initializes market snapshots
  snapshotMarket(
      marketID,
      blockNumber,
      timestamp
  );

  snapshotFinancials(
      PROTOCOL_ADDRESS,
      blockNumber,
      timestamp,
  );

  updateMarketSnapshots(
    marketID,
    data.block.header.time.seconds,
    depositUSD,
    EventType.Deposit
  );

  snapshotUsage(
    PROTOCOL_ADDRESS,
    deposit.blockNumber,
    deposit.timestamp ,
    minter,
    EventType.Deposit
  );
}