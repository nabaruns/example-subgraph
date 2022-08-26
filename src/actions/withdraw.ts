import { cosmos, log, BigInt } from "@graphprotocol/graph-ts";
import { eventId, snapshotFinancials, snapshotMarket, snapshotUsage, updateAllMarketPrices, updateMarketSnapshots, updateProtocol } from ".";
import { LendingProtocol, Market, Token, Withdraw } from "../../generated/schema";
import { EventType, exponentToBigDecimal, MARKET_ADDRESS } from "../constants";

export function _handleRedeem(data: cosmos.EventData): void {
  let event = data.event;
  const redeemAmount = BigInt.fromString(event.getAttributeValue("burn_amount"));
  const redeemer = event.getAttributeValue("user");

  let protocol = LendingProtocol.load(MARKET_ADDRESS);
  if (!protocol) {
    log.warning("[_handleRedeem] protocol not found: {}", [
      MARKET_ADDRESS,
    ]);
    return;
  }
  let marketID = event.getAttributeValue("asset");
  let market = Market.load(marketID);
  if (!market) {
    log.warning("[_handleRedeem] Market not found: {}", [marketID]);
    return;
  }
  let underlyingToken = Token.load(market.inputToken);
  if (!underlyingToken) {
    log.warning("[_handleRedeem] Failed to load underlying token: {}", [
      market.inputToken,
    ]);
    return;
  }

  let withdrawID = eventId(data);
  let withdraw = new Withdraw(withdrawID);
  withdraw.hash = data.block.header.hash.toHexString();
  withdraw.logIndex = BigInt.fromU64(data.block.header.height);
  withdraw.protocol = protocol.id;
  withdraw.to = marketID;
  withdraw.from = redeemer;
  withdraw.blockNumber = BigInt.fromU64(data.block.header.height);
  withdraw.timestamp = BigInt.fromString(data.block.header.time.seconds.toString());
  withdraw.market = marketID;
  withdraw.asset = market.inputToken;
  withdraw.amount = redeemAmount;
  let withdrawUSD = market.inputTokenPriceUSD.times(
    redeemAmount
      .toBigDecimal()
      .div(exponentToBigDecimal(underlyingToken.decimals))
  );
  withdraw.amountUSD = withdrawUSD;
  withdraw.save();

  market.outputTokenSupply = market.outputTokenSupply.minus(redeemAmount);
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
    withdrawUSD,
    EventType.Withdraw
  );

  snapshotUsage(
    MARKET_ADDRESS,
    withdraw.blockNumber,
    withdraw.timestamp ,
    redeemer,
    EventType.Withdraw
  );
}