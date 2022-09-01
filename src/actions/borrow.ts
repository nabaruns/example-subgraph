import { cosmos, log, BigInt } from "@graphprotocol/graph-ts";
import { eventActionId, snapshotFinancials, snapshotMarket, snapshotUsage, updateAllMarketPrices, updateMarketSnapshots, updateProtocol } from ".";
import { Borrow, LendingProtocol, Market, Token } from "../../generated/schema";
import { BIGINT_TEN_TO_SIXTH, EventType, exponentToBigDecimal, PROTOCOL_ADDRESS, pTokenAddrMap, pTokenDecimals } from "../constants";

export function _handleBorrow(data: cosmos.EventData): void {
  let event = data.event;
  const borrowAmount = BigInt.fromString(event.getAttributeValue("amount"));
  const borrower = event.getAttributeValue("sender");
  const asset = event.getAttributeValue("asset");

  let protocol = LendingProtocol.load(PROTOCOL_ADDRESS);
  if (!protocol) {
    log.warning("[_handleRedeem] protocol not found: {}", [
      PROTOCOL_ADDRESS,
    ]);
    return;
  }
  let marketID = pTokenAddrMap.get(asset);
  let market = Market.load(marketID);
  if (!market) {
    log.warning("[_handleBorrow] Market not found: {}", [marketID]);
    return;
  }
  let underlyingToken = Token.load(market.inputToken);
  if (!underlyingToken) {
    log.warning("[_handleBorrow] Failed to load underlying token: {}", [
      market.inputToken,
    ]);
    return;
  }

  let borrowID = eventActionId(data);
  let borrow = new Borrow(borrowID);
  borrow.hash = data.block.header.hash.toHexString();
  borrow.logIndex = BigInt.fromU64(data.block.header.height);
  borrow.protocol = protocol.id;
  borrow.to = marketID;
  borrow.from = borrower;
  borrow.blockNumber = BigInt.fromU64(data.block.header.height);
  borrow.timestamp = BigInt.fromString(data.block.header.time.seconds.toString());
  borrow.market = marketID;
  borrow.asset = market.inputToken;
  borrow.amount = borrowAmount;
  let borrowUSD = market.inputTokenPriceUSD.times(
    borrowAmount
      .toBigDecimal()
      .div(exponentToBigDecimal(underlyingToken.decimals))
  );
  borrow.amountUSD = borrowUSD;
  borrow.save();

  market._borrowBalance = market._borrowBalance
    .plus(borrowAmount
      .divDecimal(market.borrowExchangeRate)
      .times(BIGINT_TEN_TO_SIXTH.toBigDecimal())
      .truncate(0)
    );
  market.cumulativeBorrowUSD = market.cumulativeBorrowUSD.plus(borrowUSD);
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
    borrowUSD,
    EventType.Borrow
  );

  snapshotUsage(
    PROTOCOL_ADDRESS,
    borrow.blockNumber,
    borrow.timestamp ,
    borrower,
    EventType.Borrow
  );
}