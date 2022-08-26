import { cosmos, log, BigInt } from "@graphprotocol/graph-ts";
import { eventId, snapshotFinancials, snapshotMarket, snapshotUsage, updateAllMarketPrices, updateMarketSnapshots, updateProtocol } from ".";
import { Repay, LendingProtocol, Market, Token } from "../../generated/schema";
import { EventType, exponentToBigDecimal, MARKET_ADDRESS } from "../constants";

export function _handleRepayBorrow(data: cosmos.EventData): void {
  let event = data.event;
  const repayAmount = BigInt.fromString(event.getAttributeValue("amount"));
  const repayer = event.getAttributeValue("sender");

  let protocol = LendingProtocol.load(MARKET_ADDRESS);
  if (!protocol) {
    log.warning("[_handleRepayBorrow] protocol not found: {}", [
      MARKET_ADDRESS,
    ]);
    return;
  }
  let marketID = event.getAttributeValue("asset");
  let market = Market.load(marketID);
  if (!market) {
    log.warning("[_handleRepayBorrow] Market not found: {}", [marketID]);
    return;
  }
  let underlyingToken = Token.load(market.inputToken);
  if (!underlyingToken) {
    log.warning("[_handleRepayBorrow] Failed to load underlying token: {}", [
      market.inputToken,
    ]);
    return;
  }

  let repayID = eventId(data);
  let repay = new Repay(repayID);
  repay.hash = data.block.header.hash.toHexString();
  repay.logIndex = BigInt.fromU64(data.block.header.height);
  repay.protocol = protocol.id;
  repay.to = marketID;
  repay.from = repayer;
  repay.blockNumber = BigInt.fromU64(data.block.header.height);
  repay.timestamp = BigInt.fromString(data.block.header.time.seconds.toString());
  repay.market = marketID;
  repay.asset = market.inputToken;
  repay.amount = repayAmount;
  let repayUSD = market.inputTokenPriceUSD.times(
    repayAmount
      .toBigDecimal()
      .div(exponentToBigDecimal(underlyingToken.decimals))
  );
  repay.amountUSD = repayUSD;
  repay.save();

  market.cumulativeBorrowUSD = market.cumulativeBorrowUSD.minus(repayUSD);
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
      MARKET_ADDRESS,
      blockNumber,
      timestamp,
  );

  updateMarketSnapshots(
    marketID,
    data.block.header.time.seconds,
    repayUSD,
    EventType.Repay
  );

  snapshotUsage(
    MARKET_ADDRESS,
    repay.blockNumber,
    repay.timestamp ,
    repayer,
    EventType.Repay
  );
}