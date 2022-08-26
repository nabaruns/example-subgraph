import { cosmos, log, BigInt, BigDecimal } from "@graphprotocol/graph-ts";
import { eventId, getOrCreateCircularBuffer, snapshotFinancials, snapshotMarket, snapshotUsage, updateAllMarketPrices, updateMarket, updateMarketSnapshots, updateProtocol } from ".";
import { Deposit, FeedPrice, LendingProtocol, Market, Token } from "../../generated/schema";
import { DAYS_PER_YEAR, EventType, exponentToBigDecimal, MARKET_ADDRESS } from "../constants";

export function _handleOracleFeed(data: cosmos.EventData, i: i32): void {
    let event = data.event;

    let protocol = LendingProtocol.load(MARKET_ADDRESS);
    if (!protocol) {
      log.warning("[_handleOracleFeed] protocol not found: {}", [
        MARKET_ADDRESS,
      ]);
      return;
    }
    let marketID = data.event.attributes[i].value;
    let market = Market.load(marketID);
    if (!market) {
      log.warning("[_handleOracleFeed] Market not found: {}", [marketID]);
    }

    const timestamp = BigInt.fromString(data.block.header.time.seconds.toString());
    const blockNumber = BigInt.fromU64(data.block.header.height);

    let feedPrice = FeedPrice.load(marketID);
    if (!feedPrice) {
        feedPrice = new FeedPrice(marketID);
    }
    feedPrice.protocol = protocol.id;
    feedPrice.blockNumber = blockNumber;
    feedPrice.timestamp = timestamp;
    feedPrice.tokenPriceUSD = BigDecimal.fromString(data.event.attributes[i+1].value);
    feedPrice.save();

    if (market != null) {
        market.inputTokenPriceUSD = feedPrice.tokenPriceUSD;
        market.save();

        snapshotMarket(
        marketID,
        blockNumber,
        timestamp
        );

        updateAllMarketPrices(MARKET_ADDRESS, blockNumber);
        updateProtocol(MARKET_ADDRESS);

        snapshotFinancials(
        MARKET_ADDRESS,
        blockNumber,
        timestamp,
        );
    }

}