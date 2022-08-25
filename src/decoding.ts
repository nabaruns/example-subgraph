import { Protobuf, Reader } from "as-proto";

export class MsgExecuteContract {
  static decode(reader: Reader, length: i32): MsgExecuteContract {
    const end: usize = length < 0 ? reader.end : reader.ptr + length;
    const message = new MsgExecuteContract();

    while (reader.ptr < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.sender = reader.string();
          break;

        case 2:
          message.contract = reader.string();
          break;

        case 3:
          message.msg = reader.string();
          break;

        case 5:
          message.funds.push(Coin.decode(reader, reader.uint32()));
          break;

        default:
          reader.skipType(tag & 7);
          break;
      }
    }

    return message;
  }

  sender: string;
  contract: string;
  msg: string;
  funds: Array<Coin>;

  constructor(
    sender: string = "",
    contract: string = "",
    msg: string = "",
    funds: Array<Coin> = []
  ) {
    this.sender = sender;
    this.contract = contract;
    this.msg = msg;
    this.funds = funds;
  }
}

export function decodeMsgExecuteContract(a: Uint8Array): MsgExecuteContract {
  return Protobuf.decode<MsgExecuteContract>(a, MsgExecuteContract.decode);
}

export class Coin {
  static decode(reader: Reader, length: i32): Coin {
    const end: usize = length < 0 ? reader.end : reader.ptr + length;
    const message = new Coin();

    while (reader.ptr < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.denom = reader.string();
          break;

        case 2:
          message.amount = reader.string();
          break;

        default:
          reader.skipType(tag & 7);
          break;
      }
    }

    return message;
  }

  denom: string;
  amount: string;

  constructor(denom: string = "", amount: string = "") {
    this.denom = denom;
    this.amount = amount;
  }
}

export function decodeCoin(a: Uint8Array): Coin {
  return Protobuf.decode<Coin>(a, Coin.decode);
}