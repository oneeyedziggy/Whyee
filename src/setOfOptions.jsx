import React, { useState } from 'react';

const SetOfOptions = ({ id, options }) => {
  const [selectedOption, setSelectedOption] = useState(null);

  const clickHandler = (event) => {
    setSelectedOption(Number(event.target.value));
  };

  return options.map((option, index) => {
    return (
      <span key={`${id}${index}Wrapper`}>
        <label id={`${id}${index}Label`} htmlFor={`${id}${index}Control`}>
          <input
            id={`${id}${index}Control`}
            name={id}
            type="radio"
            value={index}
            onChange={clickHandler}
            checked={selectedOption === index}
          />
          <div className="button">
            <div>{option}</div>
          </div>
        </label>
      </span>
    );
  });
};

export default SetOfOptions;
