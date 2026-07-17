import React, { useState } from 'react';
import { Modal, Button } from 'react-bootstrap';

const AddModal = (props) => {
  const { setOptionList } = props;
  const [show, setShow] = useState(false);
  const [labelVal, setLabelVal] = useState('');
  const [valueVal, setValueVal] = useState('');

  const handleClose = () => setShow(false);
  const handleShow = () => setShow(true);

  const labelChange = (event) => {
    setLabelVal(event.target.value);
  };
  const valueChange = (event) => {
    setValueVal(event.target.value);
  };

  const onSave = () => {
    console.log({ labelVal, valueVal });
    setOptionList((origList) => {
      return [
        ...origList,
        {
          label: labelVal,
          value: valueVal,
        },
      ];
    });
    handleClose();
  };

  return (
    <>
      <button type="button" onClick={handleShow}>
        {'+'}
      </button>

      <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>{'Modal heading'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div>
            {'Label:'} <input id="Label" type="text" onChange={labelChange} />
          </div>
          <div>
            {'Value:'} <input id="Value" type="text" onChange={valueChange} />
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleClose}>
            {'Close'}
          </Button>
          <Button variant="primary" onClick={onSave}>
            {'Save Changes'}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};

const TestInput = () => {
  const [optionList, setOptionList] = useState([
    { label: '🙂', value: 0 },
    { label: '😐', value: 1 },
    { label: '☹️', value: 2 },
  ]);

  const onOptionRemove = (option) =>
    setOptionList((origList) =>
      origList.filter(
        (candidateOption) =>
          candidateOption.value !== option.value &&
          candidateOption !== option.label,
      ),
    );
  console.log({ optionList });
  return (
    <>
      <table>
        <tbody>
          <tr id="moodDefault" value="" selected disabled hidden>
            <td>{'Select one'}</td>
          </tr>
          {optionList
            .sort((a, b) => a.value > b.value)
            .map((option) => {
              return (
                <tr
                  key={`option${option.value}`}
                  id={`option${option.value}`}
                  value={option.value}
                >
                  <td>
                    {option.label}
                    <button
                      type="button"
                      onClick={() => onOptionRemove(option)}
                    >
                      {'X'}
                    </button>
                  </td>
                </tr>
              );
            })}
          <tr value="plus">
            <td>
              <AddModal setOptionList={setOptionList} />
            </td>
          </tr>
        </tbody>
      </table>
    </>
  );
};

export default TestInput;

/*
- record data (tolerant to missed days)
- record each points' position relative to that value's average
- compare all single sets
- ?? compare each point to all other pairs of sets 
  - flag ones that are more than a buffer above average, relative to another metric or set more than once


  mood😭🙁😐🙂😀
    1-5
  energy
    1-5 🐌🐢🐑🐕🐆
  health events
    nausea😵🤮
    headache🤕🤯
    bowel-issue💩
    period? 🩸
  activities
    showered? 🚿
    walk 🚶
  diet
    1-5? 🥡🥕🍔🍕🌮🌯
☕ 🍷 🍺 🍨 🍩 🍪
*/
